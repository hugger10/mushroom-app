import { mapUserSearchResults } from "./userSearch";

describe("mapUserSearchResults", () => {
  test("preserves backend user_id for direct chat actions", () => {
    const results = mapUserSearchResults([
      {
        user_id: 42,
        username: "alice",
        nickname: "Alice",
        avatar_url: "https://example.com/a.png"
      }
    ]);

    expect(results).toEqual([
      {
        user_id: 42,
        username: "alice",
        nickname: "Alice",
        avatar_url: "https://example.com/a.png"
      }
    ]);
    expect(results[0]).not.toHaveProperty("id");
  });
});
