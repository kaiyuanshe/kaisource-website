package models

import (
	"context"
	"errors"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

type DailyStats struct {
	gorm.Model
	Date      time.Time `gorm:"uniqueIndex"`
	Users     int
	Blogs     int
	Tutorials int
	Events    int
	Posts     int
}

type CategoryStats struct {
	Total         int     `json:"total"`
	NewThisWeek   int     `json:"new_this_week"`
	NewThisMonth  int     `json:"new_this_month"`
	WeeklyGrowth  float64 `json:"weekly_growth"`
	MonthlyGrowth float64 `json:"monthly_growth"`
}

type StatsOverview struct {
	Users     CategoryStats `json:"users"`
	Blogs     CategoryStats `json:"blogs"`
	Tutorials CategoryStats `json:"tutorials"`
	Events    CategoryStats `json:"events"`
	Posts     CategoryStats `json:"posts"`
}

type StatsResponse struct {
	Overview *StatsOverview   `json:"overview"`
	Trend    []TimeSeriesData `json:"trend"`
}

// 提供给 Controller 调用的接口
func GetStatsOverview() (StatsResponse, error) {
	var resp StatsResponse

	now := time.Now()
	today := now.Truncate(24 * time.Hour)
	startOfWeek := today.AddDate(0, 0, -6)
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())

	var stats []DailyStats
	if err := db.Where("date >= ?", startOfMonth).Order("date asc").Find(&stats).Error; err != nil {
		return resp, err
	}
	if len(stats) == 0 {
		return resp, nil
	}

	latest := stats[len(stats)-1]
	weekAgo := findClosest(stats, startOfWeek)
	monthAgo := stats[0]

	var statsOverview = StatsOverview{
		Users:     buildCategoryStats(latest.Users, weekAgo.Users, monthAgo.Users),
		Blogs:     buildCategoryStats(latest.Blogs, weekAgo.Blogs, monthAgo.Blogs),
		Tutorials: buildCategoryStats(latest.Tutorials, weekAgo.Tutorials, monthAgo.Tutorials),
		Events:    buildCategoryStats(latest.Events, weekAgo.Events, monthAgo.Events),
		Posts:     buildCategoryStats(latest.Posts, weekAgo.Posts, monthAgo.Posts),
	}
	resp.Overview = &statsOverview

	trend, err := GetLast7DaysStats()
	if err != nil {
		return resp, err
	}

	resp.Trend = trend
	return resp, nil
}

// 找到目标日期之后最近的一条记录
func findClosest(stats []DailyStats, target time.Time) DailyStats {
	for i := len(stats) - 1; i >= 0; i-- {
		if !stats[i].Date.Before(target) {
			return stats[i]
		}
	}
	return stats[0] // fallback
}

func buildCategoryStats(total, weekAgo, monthAgo int) CategoryStats {
	newThisWeek := total - weekAgo
	newThisMonth := total - monthAgo
	weeklyGrowth := calcGrowth(weekAgo, newThisWeek)
	monthlyGrowth := calcGrowth(monthAgo, newThisMonth)

	return CategoryStats{
		Total:         total,
		NewThisWeek:   newThisWeek,
		NewThisMonth:  newThisMonth,
		WeeklyGrowth:  weeklyGrowth,
		MonthlyGrowth: monthlyGrowth,
	}
}

func calcGrowth(base, delta int) float64 {
	if base <= 0 {
		if delta > 0 {
			return 100.0
		}
		return 0.0
	}
	return (float64(delta) / float64(base)) * 100.0
}

func CollectDailyStats() error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	return CollectDailyStatsContext(ctx)
}

// Cron requests can be retried or delivered to separate serverless instances.
// Keep the existing UTC-day key and let its unique index arbitrate duplicates.
// All counts must succeed before persisting a row; never publish zero counts
// merely because a table query failed or the request was cancelled.
func CollectDailyStatsContext(ctx context.Context) error {
	if db == nil {
		return errors.New("database is not initialized")
	}
	today := time.Now().UTC().Truncate(24 * time.Hour)
	return db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var exists int64
		if err := tx.Model(&DailyStats{}).Where("date = ?", today).Count(&exists).Error; err != nil {
			return err
		}
		if exists > 0 {
			return nil
		}
		counts := make([]int64, 5)
		for index, model := range []interface{}{&User{}, &Article{}, &Tutorial{}, &Event{}, &Post{}} {
			if err := tx.Model(model).Count(&counts[index]).Error; err != nil {
				return err
			}
		}
		stats := DailyStats{Date: today, Users: int(counts[0]), Blogs: int(counts[1]),
			Tutorials: int(counts[2]), Events: int(counts[3]), Posts: int(counts[4])}
		return tx.Clauses(clause.OnConflict{
			Columns: []clause.Column{{Name: "date"}}, DoNothing: true,
		}).Create(&stats).Error
	})
}

type TimeSeriesData struct {
	Date      string `json:"date"`
	Users     int    `json:"users"`
	Blogs     int    `json:"blogs"`
	Tutorials int    `json:"tutorials"`
	Events    int    `json:"events"`
	Posts     int    `json:"posts"`
}

func GetLast7DaysStats() ([]TimeSeriesData, error) {
	var statsList []DailyStats
	sevenDaysAgo := time.Now().AddDate(0, 0, -6).Truncate(24 * time.Hour) // 含当天共7天

	err := db.Where("date >= ?", sevenDaysAgo).
		Order("date ASC").
		Find(&statsList).Error
	if err != nil {
		return nil, err
	}

	// 转换成前端需要的 TimeSeriesData 格式
	var trend []TimeSeriesData
	for _, s := range statsList {
		trend = append(trend, TimeSeriesData{
			Date:      s.Date.Format("2006-01-02"),
			Users:     s.Users,
			Blogs:     s.Blogs,
			Tutorials: s.Tutorials,
			Events:    s.Events,
			Posts:     s.Posts,
		})
	}

	return trend, nil
}
