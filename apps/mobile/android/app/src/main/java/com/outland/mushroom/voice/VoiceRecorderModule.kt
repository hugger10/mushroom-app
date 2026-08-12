package com.outland.mushroom.voice

import android.media.MediaPlayer
import android.media.MediaRecorder
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.log10

class VoiceRecorderModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {
  private val mainHandler = Handler(Looper.getMainLooper())

  private var recorder: MediaRecorder? = null
  private var recorderFilePath: String? = null
  private var recorderStartedAtMs: Long = 0L
  private var recorderProgressRunnable: Runnable? = null

  private var player: MediaPlayer? = null
  private var playerProgressRunnable: Runnable? = null
  private var subscriptionDurationMs = 150L

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun addListener(eventName: String) {
    // Required for NativeEventEmitter on Android.
  }

  @ReactMethod
  fun removeListeners(count: Double) {
    // Required for NativeEventEmitter on Android.
  }

  @ReactMethod
  fun setSubscriptionDuration(sec: Double) {
    subscriptionDurationMs = (sec * 1000).toLong().coerceAtLeast(50L)
  }

  @ReactMethod
  fun startRecorder(
    uri: String?,
    audioSets: com.facebook.react.bridge.ReadableMap?,
    meteringEnabled: Boolean,
    promise: Promise
  ) {
    try {
      stopRecorderInternal(false)

      val outputFile = resolveOutputFile(uri)
      recorderFilePath = outputFile.absolutePath
      recorderStartedAtMs = System.currentTimeMillis()
      recorder =
        startRecorderWithPreferredSources(
          outputFile = outputFile,
          audioSources = buildPreferredAudioSources()
        )
      if (meteringEnabled) {
        startRecorderProgress()
      }

      promise.resolve(outputFile.absolutePath)
    } catch (error: Exception) {
      recorder = null
      recorderFilePath = null
      stopRecorderProgress()
      promise.reject("ERR_START_RECORDER", error.message, error)
    }
  }

  @ReactMethod
  fun stopRecorder(promise: Promise) {
    val outputPath = recorderFilePath
    try {
      stopRecorderInternal(true)
      promise.resolve(outputPath ?: "")
    } catch (error: Exception) {
      promise.reject("ERR_STOP_RECORDER", error.message, error)
    }
  }

  @ReactMethod
  fun startPlayer(uri: String?, httpHeaders: com.facebook.react.bridge.ReadableMap?, promise: Promise) {
    if (uri.isNullOrBlank()) {
      promise.reject("ERR_START_PLAYER", "Missing audio uri")
      return
    }

    try {
      stopPlayerInternal()

      val mediaPlayer = MediaPlayer()
      var promiseSettled = false
      val resolvePlayer = {
        if (!promiseSettled) {
          promiseSettled = true
          promise.resolve(uri)
        }
      }
      val rejectPlayer = { code: String, message: String?, error: Throwable? ->
        if (!promiseSettled) {
          promiseSettled = true
          if (error != null) {
            promise.reject(code, message, error)
          } else {
            promise.reject(code, message)
          }
        }
      }
      mediaPlayer.setOnPreparedListener {
        it.start()
        startPlayerProgress()
        resolvePlayer()
      }
      mediaPlayer.setOnCompletionListener {
        stopPlayerProgress()
        emitEvent(EVENT_PLAYBACK_ENDED, null)
        stopPlayerInternal()
      }
      mediaPlayer.setOnErrorListener { _, what, extra ->
        stopPlayerProgress()
        stopPlayerInternal()
        emitEvent(EVENT_PLAYBACK_ENDED, null)
        rejectPlayer(
          "ERR_START_PLAYER",
          "MediaPlayer playback failed (what=$what, extra=$extra)",
          null
        )
        true
      }

      if (uri.startsWith("http://") || uri.startsWith("https://")) {
        mediaPlayer.setDataSource(uri)
      } else if (uri.startsWith("asset:/")) {
        val assetName = uri.removePrefix("asset:/")
        reactApplicationContext.assets.openFd(assetName).use { descriptor ->
          mediaPlayer.setDataSource(
            descriptor.fileDescriptor,
            descriptor.startOffset,
            descriptor.length
          )
        }
      } else if (uri.startsWith("file:///android_asset/")) {
        val assetName = uri.removePrefix("file:///android_asset/")
        reactApplicationContext.assets.openFd(assetName).use { descriptor ->
          mediaPlayer.setDataSource(
            descriptor.fileDescriptor,
            descriptor.startOffset,
            descriptor.length
          )
        }
      } else {
        // 已含 scheme 的 URI（android.resource:// / content:// 等）直接交给
        // MediaPlayer 解析；纯文件路径才补 file:// 前缀。
        val normalizedUri = if (uri.contains("://")) uri else "file://$uri"
        mediaPlayer.setDataSource(reactApplicationContext, Uri.parse(normalizedUri))
      }

      mediaPlayer.prepareAsync()
      player = mediaPlayer
    } catch (error: Exception) {
      stopPlayerInternal()
      promise.reject("ERR_START_PLAYER", error.message, error)
    }
  }

  @ReactMethod
  fun stopPlayer(promise: Promise) {
    try {
      stopPlayerInternal()
      promise.resolve("stopped")
    } catch (error: Exception) {
      promise.reject("ERR_STOP_PLAYER", error.message, error)
    }
  }

  @ReactMethod
  fun uploadFile(
    uploadUrl: String,
    fileUri: String,
    fileName: String,
    mimeType: String,
    accessToken: String?,
    promise: Promise
  ) {
    performMultipartUpload(
      uploadUrl = uploadUrl,
      fileUri = fileUri,
      fieldName = "file",
      fileName = fileName,
      mimeType = mimeType,
      accessToken = accessToken,
      promise = promise
    )
  }

  @ReactMethod
  fun uploadFileWithField(
    uploadUrl: String,
    fileUri: String,
    fieldName: String,
    fileName: String,
    mimeType: String,
    accessToken: String?,
    promise: Promise
  ) {
    performMultipartUpload(
      uploadUrl = uploadUrl,
      fileUri = fileUri,
      fieldName = fieldName,
      fileName = fileName,
      mimeType = mimeType,
      accessToken = accessToken,
      promise = promise
    )
  }

  private fun performMultipartUpload(
    uploadUrl: String,
    fileUri: String,
    fieldName: String,
    fileName: String,
    mimeType: String,
    accessToken: String?,
    promise: Promise
  ) {
    Thread {
      try {
        val parsedUri =
          if (fileUri.contains("://")) Uri.parse(fileUri) else Uri.fromFile(File(fileUri))
        val sourceStream =
          openUploadInputStream(parsedUri, fileUri)
            ?: run {
              promise.reject("ERR_UPLOAD_FILE", "Attachment file does not exist")
              return@Thread
            }

        if (fileName.isBlank()) {
          sourceStream.close()
          promise.reject("ERR_UPLOAD_FILE", "Missing upload file name")
          return@Thread
        }

        val effectiveFieldName = if (fieldName.isBlank()) "file" else fieldName

        val boundary = "----MushroomBoundary${System.currentTimeMillis()}"
        val lineBreak = "\r\n"
        val connection = (URL(uploadUrl).openConnection() as HttpURLConnection).apply {
          requestMethod = "POST"
          doOutput = true
          doInput = true
          useCaches = false
          setRequestProperty(
            "Content-Type",
            "multipart/form-data; boundary=$boundary"
          )
          if (!accessToken.isNullOrBlank()) {
            setRequestProperty("Authorization", "Bearer $accessToken")
          }
        }

        connection.outputStream.buffered().use { output ->
          output.write("--$boundary$lineBreak".toByteArray())
          output.write(
            (
              "Content-Disposition: form-data; name=\"$effectiveFieldName\"; filename=\"$fileName\"" +
                lineBreak
            ).toByteArray()
          )
          output.write(("Content-Type: $mimeType$lineBreak$lineBreak").toByteArray())
          sourceStream.use { input ->
            input.copyTo(output)
          }
          output.write(lineBreak.toByteArray())
          output.write("--$boundary--$lineBreak".toByteArray())
          output.flush()
        }

        val responseCode = connection.responseCode
        val responseStream =
          if (responseCode in 200..299) {
            connection.inputStream
          } else {
            connection.errorStream
          }

        val responseText =
          responseStream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }
            ?: ""
        connection.disconnect()

        if (responseCode !in 200..299) {
          promise.reject(
            "ERR_UPLOAD_FILE",
            if (responseText.isNotBlank()) responseText else "Upload failed with code $responseCode"
          )
          return@Thread
        }

        promise.resolve(responseText)
      } catch (error: Exception) {
        promise.reject("ERR_UPLOAD_FILE", error.message, error)
      }
    }.start()
  }

  override fun invalidate() {
    stopRecorderInternal(false)
    stopPlayerInternal()
    super.invalidate()
  }

  private fun resolveOutputFile(uri: String?): File {
    if (!uri.isNullOrBlank()) {
      val normalizedPath = when {
        uri.startsWith("file://") -> Uri.parse(uri).path
        else -> uri
      }
      if (!normalizedPath.isNullOrBlank()) {
        val explicitFile = File(normalizedPath)
        explicitFile.parentFile?.mkdirs()
        return explicitFile
      }
    }

    val cacheRoot = reactApplicationContext.externalCacheDir ?: reactApplicationContext.cacheDir
    val directory = File(cacheRoot, "voice")
    directory.mkdirs()
    return File(directory, "voice-${System.currentTimeMillis()}.m4a")
  }

  private fun startRecorderProgress() {
    stopRecorderProgress()

    val runnable =
      object : Runnable {
        override fun run() {
          val currentRecorder = recorder ?: return
          val payload = Arguments.createMap().apply {
            putDouble(
              "currentPosition",
              (System.currentTimeMillis() - recorderStartedAtMs).toDouble()
            )
            putDouble("currentMetering", currentRecorder.maxAmplitude.toMeteringDb())
          }
          emitEvent(EVENT_RECORD_PROGRESS, payload)
          mainHandler.postDelayed(this, subscriptionDurationMs)
        }
      }

    recorderProgressRunnable = runnable
    mainHandler.post(runnable)
  }

  private fun stopRecorderProgress() {
    recorderProgressRunnable?.let(mainHandler::removeCallbacks)
    recorderProgressRunnable = null
  }

  private fun stopRecorderInternal(resetPath: Boolean) {
    stopRecorderProgress()

    recorder?.let { currentRecorder ->
      try {
        currentRecorder.stop()
      } catch (_: RuntimeException) {
        recorderFilePath?.let { File(it).delete() }
      } finally {
        currentRecorder.reset()
        currentRecorder.release()
      }
    }

    recorder = null
    recorderStartedAtMs = 0L
    if (resetPath) {
      recorderFilePath = null
    }
  }

  private fun startRecorderWithPreferredSources(
    outputFile: File,
    audioSources: List<Int>
  ): MediaRecorder {
    var lastError: Exception? = null

    for (audioSource in audioSources) {
      val mediaRecorder = createMediaRecorder()
      try {
        mediaRecorder.setAudioSource(audioSource)
        mediaRecorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
        mediaRecorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
        mediaRecorder.setAudioChannels(1)
        mediaRecorder.setAudioSamplingRate(16_000)
        mediaRecorder.setAudioEncodingBitRate(64_000)
        mediaRecorder.setOutputFile(outputFile.absolutePath)
        mediaRecorder.prepare()
        mediaRecorder.start()
        return mediaRecorder
      } catch (error: Exception) {
        lastError = error
        try {
          mediaRecorder.reset()
        } catch (_: Exception) {
          // Ignore reset errors during fallback to the next audio source.
        }
        mediaRecorder.release()
      }
    }

    throw lastError ?: IllegalStateException("Unable to start voice recorder")
  }

  private fun buildPreferredAudioSources(): List<Int> {
    val preferredSources = mutableListOf(MediaRecorder.AudioSource.MIC)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      preferredSources += MediaRecorder.AudioSource.UNPROCESSED
    }

    preferredSources += MediaRecorder.AudioSource.VOICE_RECOGNITION
    preferredSources += MediaRecorder.AudioSource.CAMCORDER
    return preferredSources.distinct()
  }

  private fun openUploadInputStream(uri: Uri, rawValue: String): InputStream? {
    val scheme = uri.scheme?.lowercase()
    return when {
      scheme == "content" -> reactApplicationContext.contentResolver.openInputStream(uri)
      scheme == "file" -> {
        val path = uri.path ?: return null
        val file = File(path)
        if (file.exists() && file.isFile) file.inputStream() else null
      }
      scheme.isNullOrBlank() -> {
        val file = File(rawValue)
        if (file.exists() && file.isFile) file.inputStream() else null
      }
      else -> reactApplicationContext.contentResolver.openInputStream(uri)
    }
  }

  private fun createMediaRecorder(): MediaRecorder =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      MediaRecorder(reactApplicationContext)
    } else {
      @Suppress("DEPRECATION")
      MediaRecorder()
    }

  private fun startPlayerProgress() {
    stopPlayerProgress()

    val runnable =
      object : Runnable {
        override fun run() {
          val currentPlayer = player ?: return
          if (currentPlayer.isPlaying) {
            val payload = Arguments.createMap().apply {
              putDouble("currentPosition", currentPlayer.currentPosition.toDouble())
              putDouble("duration", currentPlayer.duration.toDouble())
            }
            emitEvent(EVENT_PLAYBACK_PROGRESS, payload)
            mainHandler.postDelayed(this, subscriptionDurationMs)
          }
        }
      }

    playerProgressRunnable = runnable
    mainHandler.post(runnable)
  }

  private fun stopPlayerProgress() {
    playerProgressRunnable?.let(mainHandler::removeCallbacks)
    playerProgressRunnable = null
  }

  private fun stopPlayerInternal() {
    stopPlayerProgress()

    player?.let { currentPlayer ->
      try {
        if (currentPlayer.isPlaying) {
          currentPlayer.stop()
        }
      } catch (_: IllegalStateException) {
        // Ignore stop errors while tearing down playback.
      } finally {
        currentPlayer.reset()
        currentPlayer.release()
      }
    }

    player = null
  }

  private fun emitEvent(eventName: String, payload: WritableMap?) {
    if (!reactApplicationContext.hasActiveReactInstance()) {
      return
    }

    reactApplicationContext
      .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      .emit(eventName, payload)
  }

  private fun Int.toMeteringDb(): Double {
    if (this <= 0) {
      return -160.0
    }
    return 20.0 * log10(this.toDouble() / 32767.0)
  }

  companion object {
    private const val MODULE_NAME = "MushroomVoiceRecorder"
    private const val EVENT_RECORD_PROGRESS = "MushroomVoiceRecorderRecordProgress"
    private const val EVENT_PLAYBACK_PROGRESS = "MushroomVoiceRecorderPlaybackProgress"
    private const val EVENT_PLAYBACK_ENDED = "MushroomVoiceRecorderPlaybackEnded"
  }
}
