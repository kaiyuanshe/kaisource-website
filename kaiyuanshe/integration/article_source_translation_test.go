package integration

import (
	"testing"

	"gorm.io/gorm"
	"kaiyuanshe/models"
)

func testArticleSourceTranslations(t *testing.T, db *gorm.DB, publisherID uint) {
	create := func(category, locale string, status uint, root *uint) models.Article {
		a := models.Article{Title: category + locale, Category: category, Locale: locale,
			SourceLink: "https://example.test/" + category, PublishStatus: status,
			PublisherId: publisherID, TranslationOf: root}
		if err := db.Create(&a).Error; err != nil {
			t.Fatal(err)
		}
		return a
	}
	resolve := func(source models.Article, locale string, want models.Article) {
		t.Helper()
		var got models.Article
		if err := got.GetVisibleByID(source.ID, locale, false); err != nil || got.ID != want.ID {
			t.Fatalf("resolve %d as %s: got %d, want %d, error %v", source.ID, locale, got.ID, want.ID, err)
		}
	}
	listed := func(category, locale string, want ...models.Article) {
		t.Helper()
		got, total, err := models.QueryArticles(models.ArticleFilter{Category: category, Locale: locale, PublishStatus: 2, PageSize: 100})
		if err != nil || total != int64(len(want)) || len(got) != len(want) {
			t.Fatalf("list %s as %s: got %d/%d, want %d, error %v", category, locale, len(got), total, len(want), err)
		}
		ids := make(map[uint]bool)
		for _, a := range got {
			ids[a.ID] = true
		}
		for _, a := range want {
			if !ids[a.ID] {
				t.Fatalf("list %s as %s omitted %d", category, locale, a.ID)
			}
		}
	}

	t.Run("explicit relation wins over an older source match", func(t *testing.T) {
		zh := create("source-explicit", "zh-CN", 2, nil)
		unrelated := create(zh.Category, "en", 2, nil)
		explicit := create(zh.Category, "en", 2, &zh.ID)
		resolve(zh, "en", explicit)
		resolve(explicit, "zh-CN", zh)
		resolve(unrelated, "zh-CN", unrelated)
	})
	t.Run("draft in an explicit group cannot be bypassed", func(t *testing.T) {
		zh := create("source-draft-explicit", "zh-CN", 2, nil)
		create(zh.Category, "en", 2, nil)
		create(zh.Category, "en", 1, &zh.ID)
		resolve(zh, "en", zh)
	})
	t.Run("ambiguous matches remain separate in details and lists", func(t *testing.T) {
		zh := create("source-ambiguous", "zh-CN", 2, nil)
		en1 := create(zh.Category, "en", 2, nil)
		en2 := create(zh.Category, "en", 2, nil)
		resolve(zh, "en", zh)
		resolve(en1, "zh-CN", en1)
		listed(zh.Category, "en", zh, en1, en2)
		listed(zh.Category, "zh-CN", zh, en1, en2)
	})
	t.Run("a source-only draft neither replaces nor hides a published original", func(t *testing.T) {
		zh := create("source-draft", "zh-CN", 2, nil)
		en := create(zh.Category, "en", 1, nil)
		resolve(zh, "en", zh)
		listed(zh.Category, "en", zh)
		var got models.Article
		if err := got.GetVisibleByID(zh.ID, "en", true); err != nil || got.ID != en.ID {
			t.Fatalf("authorized draft resolution failed: %v", err)
		}
	})
	t.Run("deleted duplicates do not make a unique pair ambiguous", func(t *testing.T) {
		zh := create("source-deleted", "zh-CN", 2, nil)
		en := create(zh.Category, "en", 2, nil)
		deleted := create(zh.Category, "en", 2, nil)
		if err := db.Delete(&deleted).Error; err != nil {
			t.Fatal(err)
		}
		resolve(zh, "en", en)
		resolve(en, "zh-CN", zh)
		listed(zh.Category, "en", en)
	})
}
