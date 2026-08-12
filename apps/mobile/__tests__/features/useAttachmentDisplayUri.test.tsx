import React from "react";
import ReactTestRenderer from "react-test-renderer";
import type { MessageFileContent } from "@mushroom/shared";
import { useAttachmentDisplayUri } from "../../src/features/chat-media/hooks/useAttachmentDisplayUri";

jest.mock("@mushroom/shared", () => {
  const pickNonEmpty = (...cs: unknown[]) => {
    for (const c of cs) {
      if (typeof c === "string" && c.length > 0) return c;
    }
    return null;
  };
  return {
    __esModule: true,
    pickVideoCoverUrl: (content: any, thumbRefreshed: any) =>
      pickNonEmpty(
        thumbRefreshed?.url,
        content?.thumb_url,
        content?.preview_url
      ),
    pickAttachmentPreviewUrl: (content: any, refreshed: any) =>
      pickNonEmpty(
        refreshed?.preview_url,
        content?.preview_url,
        refreshed?.thumb_url,
        content?.thumb_url
      ),
    pickAttachmentDisplayUri: (
      content: any,
      refreshed: any,
      localCacheUri: any
    ) =>
      pickNonEmpty(
        localCacheUri,
        content?.local_preview_uri,
        pickNonEmpty(
          refreshed?.preview_url,
          content?.preview_url,
          refreshed?.thumb_url,
          content?.thumb_url
        ),
        refreshed?.url,
        content?.url
      )
  };
});

jest.mock("../../src/services/refresh-attachment-urls", () => {
  return {
    __esModule: true,
    getRefreshedAttachment: jest.fn(),
    refreshAttachmentUrlsAndCache: jest.fn(() => Promise.resolve({})),
    subscribeToAttachmentRefresh: jest.fn(() => jest.fn())
  };
});

const refreshService = jest.requireMock(
  "../../src/services/refresh-attachment-urls"
) as {
  getRefreshedAttachment: jest.Mock;
  refreshAttachmentUrlsAndCache: jest.Mock;
  subscribeToAttachmentRefresh: jest.Mock;
};

const videoContent: MessageFileContent = {
  type: 2,
  name: "a.mp4",
  url: "http://stale-vid.mp4",
  size: 1024,
  thumb_url: "http://stale-cover.jpg",
  upload_id: "vid1",
  thumbnail_upload_id: "cover1"
};

function capture(
  content: Parameters<typeof useAttachmentDisplayUri>[0],
  options?: Parameters<typeof useAttachmentDisplayUri>[1]
) {
  const out: {
    value: ReturnType<typeof useAttachmentDisplayUri> | null;
  } = { value: null };
  function Harness() {
    out.value = useAttachmentDisplayUri(content, options);
    return null;
  }
  ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<Harness />);
  });
  return out.value!;
}

beforeEach(() => {
  refreshService.getRefreshedAttachment.mockReset();
  refreshService.refreshAttachmentUrlsAndCache.mockReset();
  refreshService.refreshAttachmentUrlsAndCache.mockResolvedValue({});
  refreshService.subscribeToAttachmentRefresh.mockReset();
  refreshService.subscribeToAttachmentRefresh.mockReturnValue(jest.fn());
});

describe("useAttachmentDisplayUri video cover self-heal", () => {
  test("prefers freshly-refreshed cover attachment URL over stale content.thumb_url", () => {
    refreshService.getRefreshedAttachment.mockImplementation(id => {
      if (id === "cover1") return { url: "http://fresh-cover.jpg" };
      return undefined;
    });
    const r = capture(videoContent);
    expect(r.displayUri).toBe("http://fresh-cover.jpg");
  });

  test("falls back to content.thumb_url when cover attachment is not refreshed", () => {
    refreshService.getRefreshedAttachment.mockReturnValue(undefined);
    const r = capture(videoContent);
    expect(r.displayUri).toBe("http://stale-cover.jpg");
  });

  test("uses refreshed cover URL in previewOnly mode (media grid)", () => {
    refreshService.getRefreshedAttachment.mockImplementation(id => {
      if (id === "cover1") return { url: "http://fresh-cover.jpg" };
      return undefined;
    });
    const r = capture(videoContent, { enabled: true, previewOnly: true });
    expect(r.displayUri).toBe("http://fresh-cover.jpg");
  });

  test("handleError refreshes both main upload_id and cover attachment id", async () => {
    const r = capture(videoContent);
    await ReactTestRenderer.act(async () => {
      r.handleError();
    });
    const call = refreshService.refreshAttachmentUrlsAndCache.mock.calls[0];
    expect(call[0]).toEqual(["vid1", "cover1"]);
  });

  test("handleError refreshes only main upload_id when no cover attachment", async () => {
    const noCover = { ...videoContent, thumbnail_upload_id: undefined };
    const r = capture(noCover);
    await ReactTestRenderer.act(async () => {
      r.handleError();
    });
    const call = refreshService.refreshAttachmentUrlsAndCache.mock.calls[0];
    expect(call[0]).toEqual(["vid1"]);
  });
});
