#import <React/RCTBridgeModule.h>

// Exposes the Swift `AlertToneManager` to the React Native bridge.
// The Swift implementation lives in AlertToneManager.swift.
@interface RCT_EXTERN_MODULE(AlertToneManager, NSObject)

RCT_EXTERN_METHOD(getSystemTones:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(setTone:(NSString *)source
                  filename:(NSString *)filename
                  state:(NSString *)state
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(checkToneFile:(NSString *)filename
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
