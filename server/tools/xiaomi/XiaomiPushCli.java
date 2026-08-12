package com.mushroom.push.xiaomi;

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
          "Expected args: <appSecret> <packageName> <region> <regId> <title> <body> <payloadBase64> [messageType]");
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
    final boolean passThrough = "passthrough".equalsIgnoreCase(messageType);

    Constants.useOfficial();
    final Sender sender =
        "mainland".equalsIgnoreCase(region)
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
    }
    final Message message = builder.build();
    final Result result = sender.send(message, regId, 3);
    if (result == null || result.getErrorCode() == null) {
      throw new IllegalStateException("Xiaomi push returned no result");
    }

    if (!"Success".equalsIgnoreCase(result.getErrorCode().toString())) {
      throw new IllegalStateException(
          "Xiaomi push failed: " + result.getErrorCode() + " / " + result.getReason());
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
