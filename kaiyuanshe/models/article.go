package models

import (
	"errors"
	"time"

	"github.com/lib/pq"
	"gorm.io/gorm"
)

type Article struct {
	gorm.Model
	Title         string         `json:"title"`
	Description   string         `json:"description"`
	Content       string         `gorm:"type:text" json:"content"`
	SourceLink    string         `json:"source_link"`
	SourceType    string         `json:"source_type"`
	CoverImg      string         `json:"cover_img"`
	Tags          pq.StringArray `gorm:"type:text[]" json:"tags"`
	Category      string         `json:"category"`
	License       string         `json:"license"`
	Author        string         `json:"author"`
	Translator    string         `json:"translator"`
	Editor        string         `json:"editor"`
	PublisherId   uint           `json:"publisher_id"`
	Publisher     *User          `gorm:"foreignKey:PublisherId" json:"publisher"`
	PublishTime   *time.Time     `json:"publish_time"`
	PublishStatus uint           `gorm:"default:1" json:"publish_status"` // 0:全部 1:待审核 2:已发布
	ViewCount     uint           `gorm:"default:0" json:"view_count"`
	Locale        string         `gorm:"size:10;not null;default:zh-CN;index;uniqueIndex:idx_article_translation_locale" json:"locale"`
	TranslationOf *uint          `gorm:"index;uniqueIndex:idx_article_translation_locale" json:"translation_of,omitempty"`
}

func (a *Article) Create() error {
	return db.Create(a).Error
}

func (a *Article) GetByID(id uint) error {
	if err := db.Preload("Publisher").First(a, id).Error; err != nil {
		return err
	}

	// 更新浏览量（+1）
	// TODO: handle in controller
	return db.Model(a).Update("view_count", gorm.Expr("view_count + ?", 1)).Error
}

// GetLocalizedByID resolves a linked translation for locale when one exists.
// When it does not, the requested record is returned as a clear fallback.
func (a *Article) GetLocalizedByID(id uint, locale string) error {
	return a.GetVisibleByID(id, locale, true)
}

func (a *Article) Update() error {
	if a.ID == 0 {
		return errors.New("missing Article ID")
	}
	return db.Save(a).Error
}

func (a *Article) Delete() error {
	if a.ID == 0 {
		return errors.New("missing Article ID")
	}
	return db.Delete(a).Error
}

type ArticleFilter struct {
	Keyword       string // 标题或描述关键词
	Tag           string // 包含某个 tag
	Author        string // 作者
	Category      string // 分类
	OrderDesc     bool   // 是否按发布时间排序
	PublishStatus int    // 发布状态
	PublisherId   int
	Locale        string
	Page          int // 当前页码，从 1 开始
	PageSize      int // 每页数量，建议默认 10
}

func QueryArticles(filter ArticleFilter) ([]Article, int64, error) {
	var articles []Article
	var total int64

	query := db.Preload("Publisher").Model(&Article{})

	if filter.Keyword != "" {
		likePattern := "%" + filter.Keyword + "%"
		query = query.Where("title ILIKE ? OR description ILIKE ?", likePattern, likePattern)
	}

	if filter.Tag != "" {
		query = query.Where("? = ANY (tags)", filter.Tag)
	}

	if filter.Category != "" {
		query = query.Where("category = ?", filter.Category)
	}

	if filter.PublishStatus != 0 {
		query = query.Where("publish_status = ?", filter.PublishStatus)
	}

	if filter.PublisherId != 0 {
		query = query.Where("publisher_id = ?", filter.PublisherId)
	}

	if filter.Locale != "" {
		query = query.Where(
			`articles.locale = ? OR (
				articles.translation_of IS NULL AND NOT EXISTS (
					SELECT 1 FROM articles translations
					WHERE translations.locale = ?
					AND translations.deleted_at IS NULL
					AND (? = 0 OR translations.publish_status = ?)
					AND (
						translations.translation_of = articles.id
						OR (
							translations.translation_of IS NULL
							AND articles.source_link <> ''
							AND translations.source_link = articles.source_link
							AND translations.category = articles.category
							AND translations.id <> articles.id
							AND NOT EXISTS (
								SELECT 1 FROM articles linked
								WHERE linked.translation_of IN (articles.id, translations.id)
								AND linked.deleted_at IS NULL
							)
							AND 1 = (
								SELECT count(*) FROM articles peers
								WHERE peers.source_link = articles.source_link
								AND peers.category = articles.category
								AND peers.locale = articles.locale
								AND peers.translation_of IS NULL AND peers.deleted_at IS NULL
							)
							AND 1 = (
								SELECT count(*) FROM articles peers
								WHERE peers.source_link = translations.source_link
								AND peers.category = translations.category
								AND peers.locale = translations.locale
								AND peers.translation_of IS NULL AND peers.deleted_at IS NULL
							)
						)
					)
				)
			)`,
			filter.Locale,
			filter.Locale,
			filter.PublishStatus,
			filter.PublishStatus,
		)
	}

	// 统计总数（不加 limit 和 offset）
	query.Count(&total)

	// 排序
	if filter.OrderDesc {
		query = query.Order("publish_time DESC NULLS LAST").Order("created_at DESC")
	} else {
		query = query.Order("publish_time ASC NULLS LAST").Order("created_at ASC")
	}

	// 分页
	if filter.Page < 1 {
		filter.Page = 1
	}
	if filter.PageSize <= 0 {
		filter.PageSize = 10
	}
	offset := (filter.Page - 1) * filter.PageSize
	query = query.Offset(offset).Limit(filter.PageSize)

	err := query.Find(&articles).Error
	return articles, total, err
}

// Resolve localization within the actor's visibility boundary. In particular,
// a draft translation must not suppress or replace its published original.
func (a *Article) GetVisibleByID(id uint, locale string, includeDrafts bool) error {
	query := db.Preload("Publisher")
	if !includeDrafts {
		query = query.Where("publish_status = ?", 2)
	}
	var original Article
	if err := query.First(&original, id).Error; err != nil {
		return err
	}
	resolved := original
	if locale != "" && original.Locale != locale {
		rootID := original.ID
		if original.TranslationOf != nil {
			rootID = *original.TranslationOf
		}
		translationQuery := db.Preload("Publisher").Where("locale = ? AND (id = ? OR translation_of = ?)", locale, rootID, rootID)
		if !includeDrafts {
			translationQuery = translationQuery.Where("publish_status = ?", 2)
		}
		var translation Article
		err := translationQuery.First(&translation).Error
		if err == nil {
			resolved = translation
		} else if errors.Is(err, gorm.ErrRecordNotFound) {
			resolved, err = resolveArticleSourceTranslation(original, locale, includeDrafts)
			if err != nil {
				return err
			}
		} else {
			return err
		}
	}
	*a = resolved
	return db.Model(a).Update("view_count", gorm.Expr("view_count + ?", 1)).Error
}

// Source URLs are a compatibility fallback for otherwise unrelated CMS records.
// Never cross an explicit translation group or guess between duplicate sources.
func resolveArticleSourceTranslation(original Article, locale string, includeDrafts bool) (Article, error) {
	if original.TranslationOf != nil || original.SourceLink == "" {
		return original, nil
	}
	var candidates []Article
	err := db.Preload("Publisher").Where(
		`source_link = ? AND category = ? AND locale IN (?, ?)
		AND translation_of IS NULL`,
		original.SourceLink, original.Category, original.Locale, locale,
	).Limit(3).Find(&candidates).Error
	if err != nil {
		return original, err
	}
	if len(candidates) != 2 {
		return original, nil
	}
	var target Article
	for _, candidate := range candidates {
		if candidate.Locale == locale {
			target = candidate
		}
	}
	if target.ID == 0 || (!includeDrafts && target.PublishStatus != 2) {
		return original, nil
	}
	var linked int64
	err = db.Model(&Article{}).Where("translation_of IN ?", []uint{original.ID, target.ID}).Count(&linked).Error
	if err != nil || linked != 0 {
		return original, err
	}
	return target, nil
}
