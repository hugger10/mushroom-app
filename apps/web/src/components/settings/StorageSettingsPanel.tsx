import {
  App,
  Button,
  Empty,
  Input,
  Select,
  Skeleton,
  Space,
  Tag,
  Tooltip
} from "antd";
import { SEARCH_KEYWORD_MAX_LENGTH } from "@mushroom/shared";
import {
  DatabaseOutlined,
  DeleteOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  ReloadOutlined
} from "@ant-design/icons";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { useTranslation } from "react-i18next";
import {
  AUTO_DOWNLOAD_SIZE_LIMITS,
  formatStorageSize,
  MEDIA_AUTO_DOWNLOAD_POLICIES,
  MEDIA_CATEGORIES,
  type MediaAutoDownloadPolicy,
  type MediaCategory
} from "@mushroom/shared";
import type { Conversation } from "../../types/chat";
import {
  setMediaAutoDownloadPolicy,
  useMediaAutoDownloadPreferences
} from "../../services/mediaAutoDownloadPreferences";

/**
 * desktop media-cache 内部分类（images / files / voice / video / thumbs）→
 * 共享层 MediaCategory（photos / videos / audio / documents）的映射。
 * thumbs 行为上属于图片，归入 photos。
 */
type DesktopCacheCategory = "images" | "files" | "voice" | "video" | "thumbs";

type AppStorageStats = {
  userDataDir: string;
  mediaRoot: string;
  dbPath: string;
  logsDir: string;
  dbBytes: number;
  logsBytes: number;
};

type MediaCacheConversationStats = {
  clientConversationId: string | null;
  totalBytes: number;
  fileCount: number;
  byCategory: Record<DesktopCacheCategory, { count: number; size: number }>;
};

const DESKTOP_TO_SHARED: Record<DesktopCacheCategory, MediaCategory> = {
  images: "photos",
  thumbs: "photos",
  video: "videos",
  voice: "audio",
  files: "documents"
};

const SHARED_TO_DESKTOP: Record<MediaCategory, DesktopCacheCategory[]> = {
  photos: ["images", "thumbs"],
  videos: ["video"],
  audio: ["voice"],
  documents: ["files"]
};

interface StorageSettingsPanelProps {
  username: string | null;
}

const MIN_BYTES = 1024 * 1024;

export function StorageSettingsPanel({ username }: StorageSettingsPanelProps) {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const { preferences } = useMediaAutoDownloadPreferences(username);

  const [appStats, setAppStats] = useState<AppStorageStats | null>(null);
  const [categoryStats, setCategoryStats] = useState<
    Array<{ category: DesktopCacheCategory; count: number; size: number }>
  >([]);
  const [convStats, setConvStats] = useState<MediaCacheConversationStats[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [convSort, setConvSort] = useState<"size" | "recent">("size");
  const [convMinFilter, setConvMinFilter] = useState(true);
  const [convQuery, setConvQuery] = useState("");
  const [convExpanded, setConvExpanded] = useState(false);
  const TOP_N = 5;

  const refresh = useCallback(async () => {
    if (!username) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [stats, byConv, convs, app] = await Promise.all([
        window.electronAPI.getMediaCacheStats(),
        window.electronAPI.getMediaCacheStatsByConversation(),
        window.electronAPI.getConversations(true, true),
        window.electronAPI.getAppStorageStats()
      ]);
      setCategoryStats(
        (stats || []).map(row => ({
          category: row.category as DesktopCacheCategory,
          count: row.count,
          size: row.size
        }))
      );
      setConvStats(byConv || []);
      setConversations(convs || []);
      setAppStats(app);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      void message.error(msg || "Network error");
    } finally {
      setLoading(false);
    }
  }, [message, username]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ---- 概览：把 desktop 分类聚合到共享层四类 ----
  const sharedCategoryAggregate = useMemo(() => {
    const result: Record<MediaCategory, { count: number; size: number }> = {
      photos: { count: 0, size: 0 },
      videos: { count: 0, size: 0 },
      audio: { count: 0, size: 0 },
      documents: { count: 0, size: 0 }
    };
    for (const row of categoryStats) {
      const shared = DESKTOP_TO_SHARED[row.category];
      if (!shared) continue;
      result[shared].count += row.count;
      result[shared].size += row.size;
    }
    return result;
  }, [categoryStats]);

  const totalBytes = useMemo(
    () => categoryStats.reduce((sum, r) => sum + r.size, 0),
    [categoryStats]
  );

  const conversationLookup = useMemo(() => {
    const map = new Map<string, Conversation>();
    for (const c of conversations) map.set(c.client_conversation_id, c);
    return map;
  }, [conversations]);

  const sortedConvStats = useMemo(() => {
    const filtered = convStats.filter(stat =>
      convMinFilter ? stat.totalBytes >= MIN_BYTES : true
    );
    if (convSort === "size") {
      return [...filtered].sort((a, b) => b.totalBytes - a.totalBytes);
    }
    // last_message_time 缺失或不可解析时退化为 0，避免 NaN 比较导致排序不稳定。
    const getTime = (stat: MediaCacheConversationStats): number => {
      if (!stat.clientConversationId) return 0;
      const raw = conversationLookup.get(
        stat.clientConversationId
      )?.last_message_time;
      if (!raw) return 0;
      const t = new Date(raw).getTime();
      return Number.isFinite(t) ? t : 0;
    };
    return [...filtered].sort((a, b) => getTime(b) - getTime(a));
  }, [convMinFilter, convSort, convStats, conversationLookup]);

  // 会话名解析（统一供搜索 / 渲染使用）
  const labelOfConv = useCallback(
    (stat: MediaCacheConversationStats): string => {
      if (!stat.clientConversationId)
        return t("settings.storage.byConversation.orphan");
      const conv = conversationLookup.get(stat.clientConversationId);
      return (
        conv?.display_name ||
        conv?.name ||
        t("settings.storage.byConversation.unknown")
      );
    },
    [conversationLookup, t]
  );

  const queriedConvStats = useMemo(() => {
    const q = convQuery.trim().toLowerCase();
    if (!q) return sortedConvStats;
    return sortedConvStats.filter(s =>
      labelOfConv(s).toLowerCase().includes(q)
    );
  }, [convQuery, labelOfConv, sortedConvStats]);

  const visibleConvStats = useMemo(
    () => (convExpanded ? queriedConvStats : queriedConvStats.slice(0, TOP_N)),
    [convExpanded, queriedConvStats]
  );

  const restConvCount = Math.max(0, queriedConvStats.length - TOP_N);
  const restConvBytes = useMemo(
    () => queriedConvStats.slice(TOP_N).reduce((s, r) => s + r.totalBytes, 0),
    [queriedConvStats]
  );
  const maxConvBytes = queriedConvStats[0]?.totalBytes ?? 1;

  // ---- 自动下载策略 ----
  const policyOptions = useMemo(
    () =>
      MEDIA_AUTO_DOWNLOAD_POLICIES.map(value => ({
        value,
        label: t(`settings.storage.autoDownload.policy.${value}`)
      })),
    [t]
  );

  async function handlePolicyChange(
    category: MediaCategory,
    next: MediaAutoDownloadPolicy
  ) {
    try {
      await setMediaAutoDownloadPolicy(username, category, next);
    } catch {
      void message.error(t("settings.storage.autoDownload.updateFailed"));
    }
  }

  function policyLimitHint(category: MediaCategory): string {
    const limits = AUTO_DOWNLOAD_SIZE_LIMITS[category];
    const wifi = limits.wifi;
    if (!Number.isFinite(wifi)) {
      return t("settings.storage.autoDownload.unlimited");
    }
    if (wifi <= 0) return "";
    return t("settings.storage.autoDownload.limit", {
      size: formatStorageSize(wifi)
    });
  }

  // ---- 按会话清理 ----
  function handleCleanupConversation(stat: MediaCacheConversationStats) {
    modal.confirm({
      title: t("settings.storage.byConversation.confirm.title"),
      content: t("settings.storage.byConversation.confirm.content"),
      okText: t("settings.storage.byConversation.confirm.ok"),
      cancelText: t("settings.storage.byConversation.confirm.cancel"),
      onOk: async () => {
        if (!username) return;
        setBusy(true);
        try {
          const res = await window.electronAPI.cleanupMediaCacheByConversation({
            clientConversationId: stat.clientConversationId
          });
          void message.success(
            t("settings.storage.cleanup.done", {
              size: formatStorageSize(res.deletedSize)
            })
          );
          await refresh();
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          void message.error(msg || "Network error");
        } finally {
          setBusy(false);
        }
      }
    });
  }

  // ---- 全局清理 ----
  const [cleanupCategories, setCleanupCategories] = useState<MediaCategory[]>([
    "photos",
    "videos",
    "audio",
    "documents"
  ]);
  const [cleanupOlderThan, setCleanupOlderThan] = useState<number>(0); // 0 = all

  async function handleScopedCleanup() {
    if (!username) return;
    if (cleanupCategories.length === 0) {
      void message.warning(t("settings.storage.cleanup.noneSelected"));
      return;
    }
    modal.confirm({
      title: t("settings.storage.cleanup.confirm.title"),
      content: t("settings.storage.cleanup.confirm.content"),
      okText: t("settings.storage.cleanup.confirm.ok"),
      cancelText: t("settings.storage.cleanup.confirm.cancel"),
      onOk: async () => {
        setBusy(true);
        try {
          const desktopCats = cleanupCategories.flatMap(
            c => SHARED_TO_DESKTOP[c]
          );
          const res = await window.electronAPI.cleanupMediaCache({
            categories: desktopCats,
            olderThanDays: cleanupOlderThan > 0 ? cleanupOlderThan : undefined
          });
          if (res.deletedCount === 0) {
            void message.info(t("settings.storage.cleanup.nothing"));
          } else {
            void message.success(
              t("settings.storage.cleanup.done", {
                size: formatStorageSize(res.deletedSize)
              })
            );
          }
          await refresh();
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          void message.error(msg || "Network error");
        } finally {
          setBusy(false);
        }
      }
    });
  }

  function handleClearAll() {
    if (!username) return;
    modal.confirm({
      title: t("settings.storage.cleanup.clearAllConfirm.title"),
      content: t("settings.storage.cleanup.clearAllConfirm.content"),
      okText: t("settings.storage.cleanup.clearAllConfirm.ok"),
      cancelText: t("settings.storage.cleanup.clearAllConfirm.cancel"),
      okButtonProps: { danger: true },
      onOk: async () => {
        setBusy(true);
        try {
          const res = await window.electronAPI.cleanupMediaCache({});
          void message.success(
            t("settings.storage.cleanup.done", {
              size: formatStorageSize(res.deletedSize)
            })
          );
          await refresh();
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          void message.error(msg || "Network error");
        } finally {
          setBusy(false);
        }
      }
    });
  }

  if (loading && !appStats) {
    return (
      <div className="im-settings-card im-settings-form-card">
        <Skeleton active paragraph={{ rows: 6 }} />
        <span className="im-settings-info-label" style={{ marginTop: 12 }}>
          {t("settings.storage.loading")}
        </span>
      </div>
    );
  }

  return (
    <div className="im-settings-storage-panel">
      {/* 概览 */}
      <section className="im-settings-card im-settings-form-card">
        <header className="im-settings-card-header">
          <div>
            <h3 className="im-settings-card-title">
              {t("settings.storage.overview.title")}
            </h3>
            <p className="im-settings-card-subtitle">
              {t("settings.storage.overview.subtitle")}
            </p>
          </div>
          <Tooltip title={t("settings.storage.refresh")}>
            <Button
              type="text"
              icon={<ReloadOutlined />}
              onClick={() => void refresh()}
            />
          </Tooltip>
        </header>
        <div className="im-storage-overview">
          <div className="im-storage-overview-total">
            <span className="label">
              {t("settings.storage.overview.total")}
            </span>
            <span className="value">{formatStorageSize(totalBytes)}</span>
          </div>
          <div
            className="im-storage-stacked-bar"
            role="img"
            aria-label={t("settings.storage.overview.title")}
          >
            {totalBytes > 0 ? (
              MEDIA_CATEGORIES.map(cat => {
                const agg = sharedCategoryAggregate[cat];
                const pct = (agg.size / totalBytes) * 100;
                if (pct <= 0) return null;
                return (
                  <span
                    key={cat}
                    className={`seg seg-${cat}`}
                    style={{ width: `${pct}%` }}
                    title={`${t(
                      `settings.storage.overview.categories.${cat}`
                    )}: ${formatStorageSize(agg.size)}`}
                  />
                );
              })
            ) : (
              <span className="seg seg-empty" />
            )}
          </div>
          <div className="im-storage-overview-cards">
            {MEDIA_CATEGORIES.map(category => {
              const agg = sharedCategoryAggregate[category];
              return (
                <div className="im-storage-cat-card" key={category}>
                  <span className={`dot dot-${category}`} />
                  <div className="meta">
                    <div className="name">
                      {t(`settings.storage.overview.categories.${category}`)}
                    </div>
                    <div className="size">{formatStorageSize(agg.size)}</div>
                  </div>
                  <Tag color={agg.count > 0 ? "blue" : "default"}>
                    {agg.count}
                  </Tag>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* 应用数据 */}
      {appStats ? (
        <section className="im-settings-card im-settings-form-card">
          <header className="im-settings-card-header">
            <div>
              <h3 className="im-settings-card-title">
                {t("settings.storage.appData.title")}
              </h3>
              <p className="im-settings-card-subtitle">
                {t("settings.storage.appData.subtitle")}
              </p>
            </div>
          </header>
          <div className="im-settings-info-rows">
            <AppDataRow
              icon={<DatabaseOutlined />}
              label={t("settings.storage.appData.database")}
              size={formatStorageSize(appStats.dbBytes)}
              path={appStats.dbPath}
            />
            <AppDataRow
              icon={<FileTextOutlined />}
              label={t("settings.storage.appData.logs")}
              size={formatStorageSize(appStats.logsBytes)}
              path={appStats.logsDir}
            />
            <AppDataRow
              icon={<FolderOpenOutlined />}
              label={t("settings.storage.appData.userData")}
              path={appStats.userDataDir}
            />
            <AppDataRow
              icon={<FolderOpenOutlined />}
              label={t("settings.storage.appData.mediaRoot")}
              path={appStats.mediaRoot}
            />
          </div>
        </section>
      ) : null}

      {/* 自动下载 */}
      <section className="im-settings-card im-settings-form-card">
        <header className="im-settings-card-header">
          <div>
            <h3 className="im-settings-card-title">
              {t("settings.storage.autoDownload.title")}
            </h3>
            <p className="im-settings-card-subtitle">
              {t("settings.storage.autoDownload.subtitle")}
            </p>
          </div>
        </header>
        <div className="im-storage-auto-grid">
          {MEDIA_CATEGORIES.map(category => (
            <div className="im-storage-auto-card" key={category}>
              <div className="im-storage-auto-head">
                <span className={`dot dot-${category}`} />
                <span className="name">
                  {t(`settings.storage.autoDownload.labels.${category}`)}
                </span>
              </div>
              <div className="im-storage-auto-desc">
                {t(`settings.storage.autoDownload.descriptions.${category}`)}
                <span className="hint">{policyLimitHint(category)}</span>
              </div>
              <Select<MediaAutoDownloadPolicy>
                className="im-settings-select"
                size="small"
                value={preferences[category]}
                options={policyOptions}
                onChange={value => void handlePolicyChange(category, value)}
              />
            </div>
          ))}
        </div>
      </section>

      {/* 按会话管理 */}
      <section className="im-settings-card im-settings-form-card">
        <header className="im-settings-card-header">
          <div>
            <h3 className="im-settings-card-title">
              {t("settings.storage.byConversation.title")}
            </h3>
            <p className="im-settings-card-subtitle">
              {t("settings.storage.byConversation.subtitle", {
                count: convStats.length,
                size: formatStorageSize(
                  convStats.reduce((s, r) => s + r.totalBytes, 0)
                )
              })}
            </p>
          </div>
          <Space>
            <Select
              size="small"
              value={convSort}
              onChange={v => setConvSort(v)}
              style={{ width: 140 }}
              options={[
                {
                  value: "size",
                  label: t("settings.storage.byConversation.sortBySize")
                },
                {
                  value: "recent",
                  label: t("settings.storage.byConversation.sortByRecent")
                }
              ]}
            />
            <Button
              className="im-bordered-button"
              size="small"
              type={convMinFilter ? "primary" : "default"}
              onClick={() => setConvMinFilter(v => !v)}
            >
              {t("settings.storage.byConversation.minSize")}
            </Button>
          </Space>
        </header>
        <Input.Search
          className="im-conv-search"
          size="small"
          allowClear
          enterButton={t("settings.storage.byConversation.searchAction")}
          placeholder={t("settings.storage.byConversation.searchPlaceholder")}
          value={convQuery}
          onChange={e => setConvQuery(e.target.value)}
          maxLength={SEARCH_KEYWORD_MAX_LENGTH}
        />
        {queriedConvStats.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t("settings.storage.byConversation.empty")}
          />
        ) : (
          <>
            <ul className={`im-conv-list${convExpanded ? " is-expanded" : ""}`}>
              {visibleConvStats.map(stat => {
                const label = labelOfConv(stat);
                const widthPct =
                  maxConvBytes > 0
                    ? Math.max(
                        2,
                        Math.round((stat.totalBytes / maxConvBytes) * 100)
                      )
                    : 0;
                const rowKey = stat.clientConversationId ?? "__orphan__";
                return (
                  <li className="im-conv-row" key={rowKey}>
                    <span className="name" title={label}>
                      {label}
                    </span>
                    <span
                      className="bar"
                      aria-label={formatStorageSize(stat.totalBytes)}
                    >
                      <i style={{ width: `${widthPct}%` }} />
                    </span>
                    <span className="size">
                      {formatStorageSize(stat.totalBytes)}
                    </span>
                    <span className="files">{stat.fileCount}</span>
                    <Button
                      size="small"
                      danger
                      type="text"
                      icon={<DeleteOutlined />}
                      loading={busy}
                      onClick={() => handleCleanupConversation(stat)}
                      aria-label={t(
                        "settings.storage.byConversation.rowAction"
                      )}
                    />
                  </li>
                );
              })}
            </ul>
            {restConvCount > 0 ? (
              <button
                type="button"
                className="im-conv-toggle"
                onClick={() => setConvExpanded(v => !v)}
              >
                {convExpanded
                  ? t("settings.storage.byConversation.collapse")
                  : t("settings.storage.byConversation.expand", {
                      count: restConvCount,
                      size: formatStorageSize(restConvBytes)
                    })}
              </button>
            ) : null}
          </>
        )}
      </section>

      {/* 全局清理 */}
      <section className="im-settings-card im-settings-form-card">
        <header className="im-settings-card-header">
          <div>
            <h3 className="im-settings-card-title">
              {t("settings.storage.cleanup.title")}
            </h3>
            <p className="im-settings-card-subtitle">
              {t("settings.storage.cleanup.subtitle")}
            </p>
          </div>
        </header>
        <div className="im-storage-cleanup-grid">
          <div className="im-storage-cleanup-field">
            <span className="im-settings-info-label">
              {t("settings.storage.cleanup.scope")}
            </span>
            <Select<MediaCategory[]>
              mode="multiple"
              className="im-settings-select"
              value={cleanupCategories}
              onChange={v => setCleanupCategories(v)}
              options={MEDIA_CATEGORIES.map(c => ({
                value: c,
                label: t(`settings.storage.overview.categories.${c}`)
              }))}
            />
          </div>
          <div className="im-storage-cleanup-field">
            <span className="im-settings-info-label">
              {t("settings.storage.cleanup.olderThan")}
            </span>
            <Select<number>
              className="im-settings-select"
              value={cleanupOlderThan}
              onChange={v => setCleanupOlderThan(v)}
              options={[
                {
                  value: 0,
                  label: t("settings.storage.cleanup.olderThanOptions.all")
                },
                {
                  value: 7,
                  label: t("settings.storage.cleanup.olderThanOptions.d7")
                },
                {
                  value: 30,
                  label: t("settings.storage.cleanup.olderThanOptions.d30")
                },
                {
                  value: 90,
                  label: t("settings.storage.cleanup.olderThanOptions.d90")
                }
              ]}
            />
          </div>
        </div>
        <div className="im-storage-cleanup-actions">
          <Button
            type="primary"
            icon={<DeleteOutlined />}
            loading={busy}
            onClick={() => void handleScopedCleanup()}
          >
            {t("settings.storage.cleanup.submit")}
          </Button>
          <Button
            danger
            icon={<DeleteOutlined />}
            loading={busy}
            onClick={() => handleClearAll()}
          >
            {t("settings.storage.cleanup.clearAll")}
          </Button>
        </div>
      </section>
    </div>
  );
}

function AppDataRow(props: {
  /** 行首图标 */
  icon?: ReactNode;
  label: string;
  /** 可选：当前条目的体积，例如 "12.3 MB"。无体积时（如 userData / mediaRoot 目录）省略。 */
  size?: string;
  /** 实际文件 / 目录路径；空字符串时禁用「打开」按钮。路径以缩略形式展示。 */
  path: string;
}) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const hasPath = props.path.length > 0;

  async function handleOpen() {
    if (!hasPath) return;
    try {
      await window.electronAPI.openStoragePath(props.path);
    } catch {
      void message.error(t("settings.storage.appData.openFailed"));
    }
  }

  return (
    <div className="im-settings-info-row">
      {props.icon ? (
        <span className="im-settings-info-row-icon">{props.icon}</span>
      ) : null}
      <span className="im-settings-info-label">{props.label}</span>
      {props.path ? (
        <span className="im-settings-info-row-path" title={props.path}>
          {props.path}
        </span>
      ) : null}
      <span className="im-settings-info-value">{props.size ?? ""}</span>
      <Tooltip title={t("settings.storage.appData.open")}>
        <Button
          className="im-bordered-button"
          size="small"
          type="text"
          icon={<FolderOpenOutlined />}
          disabled={!hasPath}
          onClick={() => void handleOpen()}
        />
      </Tooltip>
    </div>
  );
}
