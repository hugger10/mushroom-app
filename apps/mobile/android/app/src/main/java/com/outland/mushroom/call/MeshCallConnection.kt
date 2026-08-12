package com.outland.mushroom.call

import android.telecom.Connection
import android.telecom.DisconnectCause

/**
 * A self-managed call connection. Bridges system incoming-call actions
 * (answer/reject/disconnect) back to JS through [onAction], then resolves the
 * connection state. The actual call media is handled by WebRTC/LiveKit in JS;
 * this connection only drives the OS-level ringing state and events.
 */
class MeshCallConnection(
  private val callId: String,
  @Suppress("unused") private val callerName: String,
  @Suppress("unused") private val hasVideo: Boolean,
  private val onAction: (action: String, callId: String) -> Unit
) : Connection() {

  override fun onAnswer() {
    onAction(CallConnectionModule.EVENT_ANSWER, callId)
    // Mark the connection active so the OS treats the call as in-progress.
    setActive()
  }

  override fun onReject() {
    onAction(CallConnectionModule.EVENT_END, callId)
    setDisconnected(DisconnectCause(DisconnectCause.REJECTED))
    destroy()
  }

  override fun onDisconnect() {
    onAction(CallConnectionModule.EVENT_END, callId)
    setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
    destroy()
  }
}
