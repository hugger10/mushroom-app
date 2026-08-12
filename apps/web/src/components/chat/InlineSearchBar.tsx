import { useEffect, useRef } from "react";
import {
  CloseOutlined,
  SearchOutlined,
  UpOutlined,
  DownOutlined
} from "@ant-design/icons";
import { Input, type InputRef } from "antd";
import { useTranslation } from "react-i18next";
import { SEARCH_KEYWORD_MAX_LENGTH } from "@mushroom/shared";

interface InlineSearchBarProps {
  visible: boolean;
  keyword: string;
  currentIndex: number;
  totalCount: number;
  isSearching: boolean;
  onKeywordChange: (value: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}

export function InlineSearchBar({
  visible,
  keyword,
  currentIndex,
  totalCount,
  isSearching,
  onKeywordChange,
  onPrev,
  onNext,
  onClose
}: InlineSearchBarProps) {
  const { t } = useTranslation();
  const inputRef = useRef<InputRef>(null);

  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 60);
    }
  }, [visible]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // IME 候选词（中文/日文/韩文拼音输入）激活时不拦截任何键，避免破坏
    // 候选词选择（↑/↓ 切换候选）和首选词上屏（Enter）。
    // 兼容写法：现代浏览器用 nativeEvent.isComposing；旧 Safari/IE 仅暴露 keyCode 229。
    if (e.nativeEvent.isComposing || e.keyCode === 229) {
      return;
    }
    if (e.key === "Escape") {
      onClose();
    } else if (e.key === "Enter") {
      if (e.shiftKey) {
        onPrev();
      } else {
        onNext();
      }
    } else if (e.key === "ArrowUp") {
      // 与按钮 UI 上的上箭头语义一致：跳到上一个匹配。
      e.preventDefault();
      onPrev();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      onNext();
    }
  };

  if (!visible) {
    return null;
  }

  return (
    <div className="im-inline-search-bar">
      <SearchOutlined className="im-inline-search-icon" />
      <Input
        ref={inputRef}
        className="im-inline-search-input"
        value={keyword}
        onChange={e => onKeywordChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("chat.searchPlaceholder")}
        variant="borderless"
        size="small"
        maxLength={SEARCH_KEYWORD_MAX_LENGTH}
      />
      <div className="im-inline-search-status">
        {isSearching ? (
          <span className="im-inline-search-counting">...</span>
        ) : keyword.trim() && totalCount > 0 ? (
          <span className="im-inline-search-count">
            {currentIndex + 1}/{totalCount}
          </span>
        ) : keyword.trim() && totalCount === 0 ? (
          <span className="im-inline-search-count im-inline-search-no-result">
            0/{totalCount}
          </span>
        ) : null}
      </div>
      <button
        className="im-inline-search-btn"
        onClick={onPrev}
        disabled={totalCount === 0 || currentIndex <= 0}
        aria-label={t("chat.previous")}
        type="button"
      >
        <UpOutlined />
      </button>
      <button
        className="im-inline-search-btn"
        onClick={onNext}
        disabled={totalCount === 0 || currentIndex >= totalCount - 1}
        aria-label={t("chat.next")}
        type="button"
      >
        <DownOutlined />
      </button>
      <button
        className="im-inline-search-btn im-inline-search-close"
        onClick={onClose}
        aria-label={t("common.close")}
        type="button"
      >
        <CloseOutlined />
      </button>
    </div>
  );
}
