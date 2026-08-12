/**
 * QR scanner abstraction (T19b — Phase B placeholder).
 *
 * Phase B intentionally ships **without** a working QR scanner. The previous
 * `react-native-image-picker` based implementation never actually scanned —
 * it just opened the camera and returned the captured photo's URI as if it
 * were a QR payload. That fake flow misled UX QA and blocked the eventual
 * native scanner integration.
 *
 * The interface below defines the contract a real scanner module
 * (e.g. `react-native-vision-camera` + `vision-camera-code-scanner`, or an
 * iOS `AVCaptureMetadataOutput` / Android `MLKitBarcodeScanning` bridge)
 * must satisfy when it lands. Until then, {@link scanQRCode} resolves to a
 * sentinel that callers should handle by surfacing a toast.
 */
export type QRScanResult =
  | { status: "ok"; payload: string }
  | { status: "cancelled" }
  | { status: "unavailable"; reason?: string };

export interface QRScannerModule {
  /**
   * Open the platform scanner UI and resolve with the decoded payload or
   * an explicit cancellation / unavailability marker. Implementations must
   * never throw; convert errors into `{ status: "unavailable" }`.
   */
  scanQRCode(options?: {
    title?: string;
    /**
     * Optional permission gate. Implementations may ignore this and use
     * their own permission flow if they are wired to a native module.
     */
    ensureCameraPermission?: () => Promise<boolean>;
  }): Promise<QRScanResult>;
}

/**
 * Default (no-op) implementation. Always reports unavailable.
 */
export const qrScanner: QRScannerModule = {
  async scanQRCode() {
    return { status: "unavailable", reason: "not-implemented" };
  }
};

/**
 * Convenience helper mirroring the module method.
 */
export function scanQRCode(
  options?: Parameters<QRScannerModule["scanQRCode"]>[0]
): Promise<QRScanResult> {
  return qrScanner.scanQRCode(options);
}
