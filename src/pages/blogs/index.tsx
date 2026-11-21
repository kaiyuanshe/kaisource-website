import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Pagination,
  Input,
  Button,
  Tag,
  Card,
  Popconfirm,
  Modal,
  Image,
  App as AntdApp,
} from "antd";
import {
  Calendar,
  Plus,
  Edit,
  Trash2,
  Star,
  Share2,
  LayoutGrid,
  List,
  Eye,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import styles from "./index.module.css";
import { useAuth } from "@/contexts/AuthContext";
import { getArticles, deleteArticle } from "@/services/article";
import LocalizedText from "@/components/LocalizedText";
import { useTranslation } from "@/hooks/useTranslation";

const { Search: AntSearch } = Input;

type ViewMode = "grid" | "list";

export function formatTime(isoTime: string, locale = "zh-CN"): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(isoTime));
}

export default function BlogsPage() {
  const { locale, translateText: translateUiText } = useTranslation();
  const router = useRouter();
  const { query, isReady } = router;

  // 状态管理
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(6);
  const [articles, setArticles] = useState<Record<string, any>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [activeKeyword, setActiveKeyword] = useState("");
  const [selectedTag] = useState("");
  const [sortOrder] = useState<"asc" | "desc">("desc");
  const [wechatModalVisible, setWechatModalVisible] = useState(false);
  const [publishStatus, setPublishStatus] = useState(2);
  const [category] = useState("blog");
  const latestRequest = useRef(0);

  // 认证上下文
  const { session, status } = useAuth();
  const permissions = useMemo(
    () => session?.user?.permissions || [],
    [session?.user?.permissions],
  );
  const { message } = AntdApp.useApp();
  const newPublishStatus =
    status === "authenticated" &&
    (permissions.includes("article:write") ||
      permissions.includes("article:review"))
      ? 0
      : 2;

  // 从 URL 参数初始化 searchKeyword
  useEffect(() => {
    if (!isReady) return;
    const keyword = typeof query.keyword === "string" ? query.keyword : "";
    setSearchKeyword(keyword);
    setActiveKeyword(keyword);
    setCurrentPage(1);
  }, [isReady, query.keyword]);

  // 加载博客列表 - 使用 useMemo 避免不必要的重新创建
  const loadArticles = useCallback(
    async (params?: {
      keyword?: string;
      tag?: string;
      order?: "asc" | "desc";
      page?: number;
      page_size?: number;
      publish_status?: number;
    }) => {
      const requestId = ++latestRequest.current;
      try {
        setLoading(true);

        // 使用传入的参数或当前状态
        const actualKeyword =
          params?.keyword !== undefined ? params.keyword : activeKeyword;
        const actualPage =
          params?.page !== undefined ? params.page : currentPage;
        const actualPageSize =
          params?.page_size !== undefined ? params.page_size : pageSize;
        const actualPublishStatus =
          params?.publish_status !== undefined
            ? params.publish_status
            : publishStatus;

        const queryParams = {
          keyword: actualKeyword,
          tag: params?.tag ?? selectedTag,
          order: params?.order ?? sortOrder,
          page: actualPage,
          page_size: actualPageSize,
          publish_status: actualPublishStatus,
          category: category,
          locale,
        };

        const result = await getArticles(queryParams);
        if (requestId !== latestRequest.current) return;
        if (result.success && result.data) {
          if (result.data.articles && Array.isArray(result.data.articles)) {
            setArticles(result.data.articles);
            setTotal(result.data.total ?? result.data.articles.length);
          } else if (Array.isArray(result.data)) {
            setArticles(result.data);
            setTotal(result.data.length);
          } else {
            console.warn("API 返回的数据格式不符合预期:", result.data);
            setArticles([]);
            setTotal(0);
          }
        } else {
          console.error("获取博客列表失败:", result.message);
          setArticles([]);
          setTotal(0);
        }
      } catch (error: unknown) {
        if (requestId !== latestRequest.current) return;
        console.error("加载博客列表异常:", error);
        setArticles([]);
        setTotal(0);
      } finally {
        if (requestId === latestRequest.current) setLoading(false);
      }
    },
    [
      activeKeyword,
      selectedTag,
      sortOrder,
      currentPage,
      pageSize,
      publishStatus,
      category,
      locale,
    ],
  );

  // 搜索博客 - 更新 URL 和状态
  const handleSearch = useCallback(
    async (keyword: string) => {
      setSearchKeyword(keyword);
      setActiveKeyword(keyword);
      setCurrentPage(1);

      // 更新 URL 查询参数
      const newQuery = { ...router.query };
      if (keyword) {
        newQuery.keyword = keyword;
      } else {
        delete newQuery.keyword;
      }

      await router.push(
        {
          pathname: router.pathname,
          query: newQuery,
        },
        undefined,
        { shallow: true },
      );
    },
    [router],
  );

  // 处理输入框变化
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchKeyword(e.target.value);
    },
    [],
  );

  // 处理清空搜索
  const handleClearSearch = useCallback(() => {
    handleSearch("");
  }, [handleSearch]);

  // 分页处理
  const handlePageChange = useCallback(
    (page: number, size?: number) => {
      setCurrentPage(size && size !== pageSize ? 1 : page);
      if (size && size !== pageSize) {
        setPageSize(size);
      }
    },
    [pageSize],
  );

  // 切换视图模式
  const handleSwitchViewMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
  }, []);

  // 删除博客
  const handleDeleteArticle = useCallback(
    async (id: number) => {
      try {
        const result = await deleteArticle(id);
        if (result.success) {
          message.success(result.message);
          if (articles.length === 1 && currentPage > 1)
            setCurrentPage(currentPage - 1);
          else loadArticles();
        } else {
          message.error(result.message || "删除博客失败");
        }
      } catch {
        message.error("删除失败，请重试");
      }
    },
    [loadArticles, message, articles.length, currentPage],
  );

  useEffect(() => {
    setPublishStatus(newPublishStatus);
  }, [newPublishStatus]);

  useEffect(() => {
    if (!isReady || status === "loading" || publishStatus !== newPublishStatus)
      return;
    loadArticles();
    return () => {
      latestRequest.current += 1;
    };
  }, [isReady, status, publishStatus, newPublishStatus, loadArticles]);

  // 计算显示范围
  const startIndex = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endIndex = Math.min(currentPage * pageSize, total);
  const currentArticles = articles;

  return (
    <div className={`${styles.container} nav-t-top`}>
      {/* Header Section */}
      <div className={styles.header}>
        <div className={styles.headerContent}>
          {status === "authenticated" &&
            permissions.includes("article:write") && (
              <Link href="/blogs/new" className={styles.createButton}>
                <Plus size={20} />
                <LocalizedText>{"发布博客"}</LocalizedText>
              </Link>
            )}
        </div>
      </div>

      {/* Search Section */}
      <div className={styles.searchSection}>
        <div className={styles.searchBar}>
          <AntSearch
            placeholder={translateUiText("搜索博客标题、描述...")}
            allowClear
            size="large"
            enterButton={translateUiText("搜索")}
            value={searchKeyword}
            onChange={handleInputChange}
            onSearch={handleSearch}
            onClear={handleClearSearch}
            loading={loading}
          />
        </div>
      </div>

      {/* View Controls */}
      <div className={styles.viewControls}>
        <div className={styles.viewModeToggle}>
          <button
            className={`${styles.viewModeButton} ${viewMode === "grid" ? styles.active : ""}`}
            onClick={() => handleSwitchViewMode("grid")}
          >
            <LayoutGrid className={styles.viewModeIcon} />
            <LocalizedText>{"卡片视图"}</LocalizedText>
          </button>
          <button
            className={`${styles.viewModeButton} ${viewMode === "list" ? styles.active : ""}`}
            onClick={() => handleSwitchViewMode("list")}
          >
            <List className={styles.viewModeIcon} />
            <LocalizedText>{"列表视图"}</LocalizedText>
          </button>
        </div>
        <div className={styles.resultsInfo}>
          <Pagination
            current={currentPage}
            total={total}
            pageSize={pageSize}
            onChange={handlePageChange}
            showTotal={(total) =>
              translateUiText(
                `显示 ${startIndex}-${endIndex} 项，共 ${total} 项`,
              )
            }
            className={styles.fullPagination}
          />
        </div>
      </div>

      {/* Articles Display */}
      {loading ? (
        <div className={styles.loadingContainer}>
          <div className={styles.loadingText}>
            <LocalizedText>{"加载中..."}</LocalizedText>
          </div>
        </div>
      ) : articles.length === 0 ? (
        <div className={styles.emptyContainer}>
          <div className={styles.emptyIcon}>📖</div>
          <div className={styles.emptyTitle}>
            <LocalizedText>{"暂无博客"}</LocalizedText>
          </div>
          <div className={styles.emptyDescription}>
            {searchKeyword || selectedTag
              ? translateUiText("没有找到符合条件的博客")
              : translateUiText("还没有创建任何博客")}
          </div>
          {!searchKeyword &&
            !selectedTag &&
            status === "authenticated" &&
            permissions.includes("article:write") && (
              <Link href="/blogs/new" className={styles.createButton}>
                <Plus className={styles.buttonIcon} />
                <LocalizedText>{"发布第一个博客"}</LocalizedText>
              </Link>
            )}
        </div>
      ) : viewMode === "grid" ? (
        <div className={styles.articlesGrid}>
          {articles.map((article) => (
            <Link
              href={`/blogs/${article.ID}`}
              key={article.ID}
              className={styles.cardLink}
            >
              <Card
                className={styles.articleCard}
                cover={
                  <div className={styles.cardCover}>
                    <Image
                      alt={article.title}
                      src={
                        article.cover_img ||
                        "/placeholder.svg?height=240&width=400&text=活动封面"
                      }
                      className={styles.coverImage}
                      preview={false}
                    />

                    <div className={styles.coverOverlay}>
                      {/* {article.publish_status === 1 && (
                  <Tag className={styles.noPublishStatus}>待审核</Tag>
                  )} */}
                      <div className={styles.cardActions}>
                        {status === "authenticated" &&
                          permissions.includes("article:write") && (
                            <Button
                              className={styles.actionIconButton}
                              onClick={(e) => {
                                e.preventDefault();
                                router.push(`/blogs/${article.ID}/edit`);
                              }}
                              icon={<Edit className={styles.actionIcon} />}
                              title={translateUiText("编辑博客")}
                            />
                          )}
                        <Button
                          className={styles.actionIconButton}
                          onClick={(e) => {
                            e.preventDefault();
                            navigator.clipboard.writeText(
                              `${window.location.origin}/blogs/${article.ID}`,
                            );
                            message.success("链接已复制到剪贴板");
                          }}
                          icon={<Share2 className={styles.actionIcon} />}
                          title={translateUiText("分享博客")}
                        />

                        {status === "authenticated" &&
                          permissions.includes("article:delete") && (
                            <Popconfirm
                              title={translateUiText("删除博客")}
                              description={translateUiText(
                                "你确定删除这个博客吗？",
                              )}
                              okText={translateUiText("是")}
                              cancelText={translateUiText("否")}
                              onConfirm={(e) => {
                                e?.preventDefault();
                                handleDeleteArticle(article.ID);
                              }}
                            >
                              <Button
                                className={styles.actionIconButton}
                                onClick={(e) => {
                                  e.preventDefault();
                                }}
                                icon={<Trash2 className={styles.actionIcon} />}
                                title={translateUiText("删除博客")}
                                danger
                              />
                            </Popconfirm>
                          )}
                      </div>
                    </div>
                  </div>
                }
              >
                <div className={styles.cardBodyNew}>
                  <h3 className={styles.articleTitleNew}>{article.title}</h3>
                  <p className={styles.articleDescriptionNew}>
                    {article.description}
                  </p>
                  <div className={styles.cardFooter}>
                    <div className={styles.authorInfo}>
                      <Image
                        src={article.publisher.avatar}
                        alt={article.publisher.username}
                        width={32}
                        height={32}
                        preview={false}
                        className={styles.avatar}
                        referrerPolicy="no-referrer"
                      />

                      <div className={styles.authorText}>
                        <span className={styles.authorName}>
                          {article.author ||
                            translateUiText(article.publisher?.username || "")}
                        </span>
                        <span className={styles.publishTime}>
                          {formatTime(
                            article.publish_time || article.CreatedAt,
                            locale,
                          )}{" "}
                          ·{" "}
                          {String(article.read_time || "6").match(/\d+/)?.[0] ||
                            "6"}{" "}
                          {locale === "en" ? (
                            "minutes read"
                          ) : (
                            <>
                              <LocalizedText>{"分钟"}</LocalizedText>
                              <LocalizedText>{"阅读"}</LocalizedText>
                            </>
                          )}
                        </span>
                      </div>
                      <div className={styles.viewCount}>
                        <Eye size={24} />
                        <span className={styles.viewCountText}>
                          {article.view_count || 0}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className={styles.listViewContainer}>
          <div className={styles.articlesList}>
            <div className={styles.listHeader}>
              <div className={styles.listHeaderCell}>
                <LocalizedText>{"博客信息"}</LocalizedText>
              </div>
              <div className={styles.listHeaderCell}>
                <LocalizedText>{"作者"}</LocalizedText>
              </div>
              <div className={styles.listHeaderCell}>
                <LocalizedText>{"时间"}</LocalizedText>
              </div>
              <div className={styles.listHeaderCell}>
                <LocalizedText>{"浏览量"}</LocalizedText>
              </div>
              <div className={styles.listHeaderCell}>
                <LocalizedText>{"操作"}</LocalizedText>
              </div>
            </div>
            {currentArticles.map((article) => (
              <div key={article.ID} className={styles.listRow}>
                <div className={styles.listCell}>
                  <div className={styles.articleInfo}>
                    <Link
                      href={`/blogs/${article.ID}`}
                      className={styles.listLink}
                    >
                      {article.title}
                    </Link>
                    {article.featured && (
                      <Star className={styles.listFeaturedIcon} />
                    )}
                  </div>
                </div>
                <div className={styles.listCell}>
                  <div className={styles.publisherInfo}>
                    <UserRound className={styles.listIcon} />
                    <span>{article.author}</span>
                  </div>
                </div>
                <div className={styles.listCell}>
                  <div className={styles.timeInfo}>
                    <div className={styles.dateTime}>
                      <Calendar className={styles.listIcon} />
                      <span>
                        {formatTime(
                          article.publish_time || article.CreatedAt,
                          locale,
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                <div className={styles.listCell}>
                  <div className={styles.listViewCount}>
                    <Eye size={24} />
                    <span className={styles.listViewCountText}>
                      {article.view_count || "0"}
                    </span>
                  </div>
                </div>
                {/* <div className={styles.listCell}>
              <div className={styles.publishStatusInfo}>
              {article.publish_status === 1 && (
              <Tag color="warning">待审核</Tag>
              )}
              {article.publish_status === 2 && (
              <Tag color="success">已发布</Tag>
              )}
              </div>
              </div> */}
                <div className={styles.listCell}>
                  <div className={styles.listActions}>
                    {status === "authenticated" &&
                      permissions.includes("article:write") && (
                        <Button
                          type="text"
                          size="small"
                          icon={<Edit className={styles.listActionIcon} />}
                          title={translateUiText("编辑博客")}
                          onClick={() =>
                            router.push(`/blogs/${article.ID}/edit`)
                          }
                        />
                      )}
                    <Button
                      type="text"
                      size="small"
                      onClick={(e) => {
                        e.preventDefault();
                        navigator.clipboard.writeText(
                          `${window.location.origin}/blogs/${article.ID}`,
                        );
                        message.success("链接已复制到剪贴板");
                      }}
                      icon={<Share2 className={styles.listActionIcon} />}
                      title={translateUiText("分享博客")}
                    />

                    {status === "authenticated" &&
                      permissions.includes("article:delete") && (
                        <Popconfirm
                          title={translateUiText("删除博客")}
                          description={translateUiText(
                            "你确定删除这个博客吗？",
                          )}
                          okText={translateUiText("是")}
                          cancelText={translateUiText("否")}
                          onConfirm={() => handleDeleteArticle(article.ID)}
                        >
                          <Button
                            type="text"
                            size="small"
                            danger
                            icon={<Trash2 className={styles.listActionIcon} />}
                            title={translateUiText("删除博客")}
                          />
                        </Popconfirm>
                      )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Pagination */}
      <div className={styles.listBottomControls}>
        <div className={styles.bottomPagination}>
          <Pagination
            current={currentPage}
            total={total}
            pageSize={pageSize}
            onChange={handlePageChange}
            showTotal={(total) =>
              translateUiText(
                `显示 ${startIndex}-${endIndex} 项，共 ${total} 项`,
              )
            }
            className={styles.fullPagination}
          />
        </div>
      </div>

      {/* WeChat Modal */}
      <Modal
        open={wechatModalVisible}
        onCancel={() => setWechatModalVisible(false)}
        footer={null}
        centered
        className={styles.wechatModal}
      >
        <div className={styles.wechatModalContent}>
          <div className={styles.qrCodeSection}>
            <Image
              src=""
              alt={translateUiText("小助手二维码")}
              width={200}
              height={200}
              preview={false}
            />

            <p>
              <LocalizedText>{"扫码加入微信群"}</LocalizedText>
            </p>
          </div>
          <div className={styles.qrCodeSection}>
            <Image
              src=""
              alt={translateUiText("公众号二维码")}
              width={200}
              height={200}
              preview={false}
            />

            <p>
              <LocalizedText>{"扫码关注公众号"}</LocalizedText>
            </p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
