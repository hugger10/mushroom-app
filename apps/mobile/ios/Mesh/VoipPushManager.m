#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

// Exposes the Swift `VoipPushManager` (a RCTEventEmitter) to the React Native
// bridge. The Swift implementation lives in VoipPushManager.swift.
@interface RCT_EXTERN_MODULE(VoipPushManager, RCTEventEmitter)

RCT_EXTERN_METHOD(getToken:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
