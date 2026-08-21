package com.mushroom.push.xiaomi;

import com.xiaomi.push.sdk.ErrorCode;
import com.xiaomi.xmpush.server.Constants;
import com.xiaomi.xmpush.server.Message;
import com.xiaomi.xmpush.server.Region;
import com.xiaomi.xmpush.server.Result;
import com.xiaomi.xmpush.server.Sender;
import java.nio.charset.StandardCharsets;
import java.util.Base64;

public final class XiaomiPushCli {
  private XiaomiPushCli() {}

  public static void main(String[] args) throws Exception {
    if (args.length < 7) {
      throw new IllegalArgumentException(
          "Expected args: <appSecret> <packageName> <region> <regId> <title> <body> <payloadBase64> [messageType] [channelId] [templateId] [templateParam] [retries]");
    }

    final String appSecret = args[0];
    final String packageName = args[1];
    final String region = args[2];
    final String regId = args[3];
    final String title = args[4];
    final String body = args[5];
    final String payloadJson =
        new String(Base64.getDecoder().decode(args[6]), StandardCharsets.UTF_8);
    final String messageType = args.length >= 8 ? args[7] : "notification";
    final String channelId = args.length >= 9 ? args[8] : null;
    final String templateId = args.length >= 10 ? args[9] : null;
    final String templateParam = args.length >= 11 ? args[10] : null;
    final int retries =
        args.length >= 12 && !args[11].isBlank() ? Integer.parseInt(args[11]) : 1;
    final boolean passThrough = "passthrough".equalsIgnoreCase(messageType);

    Constants.useOfficial();
    final Sender sender =
        "china".equalsIgnoreCase(region) || "mainland".equalsIgnoreCase(region)
            ? new Sender(appSecret)
            : new Sender(appSecret, resolveRegion(region));
    final Message.Builder builder =
        new Message.Builder()
            .payload(payloadJson)
            .restrictedPackageName(packageName)
            .extra("mushroom_payload", payloadJson);
    if (passThrough) {
      // passThrough=1 → delivered straight to the app's PushMessageReceiver
      // without the SDK posting a notification. Used for call invites so the
      // HeadlessJS task can drive CallKeep / full-screen UI.
      builder.passThrough(1);
    } else {
      builder.title(title).description(body).passThrough(0).notifyType(1);
      // 点击通知栏打开 App（Launcher Activity）。不设置时小米 SDK 默认点击
      // 只取消通知、不拉起应用；`notify_effect=1` 才能唤起 App，与 FCM/HMS
      // 的 Notifee pressAction 行为对齐。
      builder.extra(
          Constants.EXTRA_PARAM_NOTIFY_EFFECT, Constants.NOTIFY_LAUNCHER_ACTIVITY);
      // 2026-08-01 消息分类新规：通知类消息必须携带已审核的 channel_id，
      // 否则小米服务器返回 `invalid channel info!`。由运营平台申请后填入
      // PUSH_XIAOMI_CHANNEL_ID。
      if (channelId != null && !channelId.isBlank()) {
        builder.extra("channel_id", channelId);
      }
      // 私信消息（模板消息）：除 channel_id 外还需 template_id + template_param，
      // 否则小米服务器返回 `template_id or template_param is empty`。title/body 为
      // 模板结构（{$keywordsN$} 占位符），template_param 填实际变量值，MiPush 负责拼装。
      if (templateId != null && !templateId.isBlank()) {
        builder.extra("template_id", templateId);
      }
      if (templateParam != null && !templateParam.isBlank()) {
        builder.extra("template_param", templateParam);
      }
    }
    final Message message = builder.build();
    final Result result = sender.send(message, regId, retries);
    if (result == null || result.getErrorCode() == null) {
      throw new IllegalStateException("Xiaomi push returned no result");
    }

    // Compare against the real error-code value instead of `toString()` (which
    // defaults to an object hash like `ErrorCode@<hash>`, never "Success").
    final ErrorCode errorCode = result.getErrorCode();
    if (errorCode.getValue() != ErrorCode.Success.getValue()) {
      throw new IllegalStateException(
          "Xiaomi push failed: code=" + errorCode.getValue()
              + " name=" + errorCode.getName()
              + " desc=" + errorCode.getFullDescription()
              + " / reason=" + result.getReason());
    }
  }

  private static Region resolveRegion(String region) {
    if ("europe".equalsIgnoreCase(region)) {
      return Region.Europe;
    }
    if ("russia".equalsIgnoreCase(region)) {
      return Region.Russia;
    }
    if ("india".equalsIgnoreCase(region)) {
      return Region.India;
    }
    return Region.Singapore;
  }
}
