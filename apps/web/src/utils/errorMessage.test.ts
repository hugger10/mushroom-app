import { getReadableErrorMessage } from "./errorMessage";

describe("getReadableErrorMessage", () => {
  test("maps direct conversation and contact errors to readable messages", () => {
    expect(
      getReadableErrorMessage(
        new Error("Cannot start a direct conversation with yourself")
      )
    ).toBe("不能给自己发起单聊。");

    expect(
      getReadableErrorMessage(new Error("Cannot delete yourself from contacts"))
    ).toBe("不能删除自己。");

    expect(
      getReadableErrorMessage(
        new Error("Unable to start a direct conversation")
      )
    ).toBe("由于屏蔽设置，无法发起单聊。");
  });

  test("maps block-list specific errors", () => {
    expect(getReadableErrorMessage(new Error("User is not blocked"))).toBe(
      "该用户当前不在屏蔽列表中。"
    );
  });
});
