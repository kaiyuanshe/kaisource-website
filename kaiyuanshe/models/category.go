package models

import (
	"errors"

	"gorm.io/gorm"
)

type Category struct {
	gorm.Model
	Name     string     `gorm:"type:varchar(50);not null" json:"name"`
	Desc     string     `json:"desc"`
	FullName string     `json:"full_name"`
	ParentId *uint      `gorm:"index" json:"parent_id"` // 父分类ID（0表示顶层）
	Parent   *Category  `gorm:"foreignKey:ParentId;references:ID" json:"parent"`
	Children []Category `gorm:"foreignKey:ParentId" json:"children"`
}

func (c *Category) Create() error {
	return db.Create(c).Error
}

func (c *Category) GetByID(id uint) error {
	return db.Preload("Children").First(c, id).Error
}

func (c *Category) Update() error {
	if c.ID == 0 {
		return errors.New("missing ID")
	}
	return db.Save(c).Error
}

func (c *Category) Delete() error {
	if c.ID == 0 {
		return errors.New("missing ID")
	}
	return db.Delete(c).Error
}

type CategoryFilter struct {
	Keyword   string
	ParentId  uint
	OrderDesc bool // 是否按创建时间倒序
	Page      int  // 当前页码，从 1 开始
	PageSize  int  // 每页数量，建议默认 10
}

func QueryCategories(filter CategoryFilter) ([]Category, int64, error) {
	var categories []Category
	var total int64

	query := db.Model(&Category{}).Preload("Children")

	if filter.Keyword != "" {
		likePattern := "%" + filter.Keyword + "%"
		query = query.Where("name LIKE ? OR desc LIKE ?", likePattern, likePattern)
	}

	if filter.ParentId == 0 { // 一级目录
		query = query.Where("parent_id is NULL")
	} else {
		// 具体查询
		query = query.Where("parent_id = ?", filter.ParentId)
	}

	// TODO: 二级目录

	// 统计总数（不加 limit 和 offset）
	query.Count(&total)

	// 排序
	if filter.OrderDesc {
		query = query.Order("created_at desc")
	} else {
		query = query.Order("created_at asc")
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

	err := query.Find(&categories).Error
	return categories, total, err
}

func InitCategories() error {
	// 一级分类
	appCategory := "App"
	infraCategory := "Infra"

	// App 的子分类
	appSubCategories := []string{
		"AI", "Betting", "DeFi", "DePIN", "Gaming", "Governance",
		"NFT", "Other Apps", "Payments", "Prediction Market", "RWA", "Social",
	}

	// Infra 的子分类
	infraSubCategories := []string{
		"Account Abstraction", "Analytics", "Cross-Chain", "Dev Tooling", "Gaming Infra",
		"Identity", "Indexer", "Onramp", "Oracle", "Other Infra", "Privacy", "RPC", "Stablecoin", "Wallet", "Zero-Knowledge",
	}

	// An operator can retry this explicit command after a failure. Do not leave
	// a partial category tree or exit the process inside model code.
	return db.Transaction(func(tx *gorm.DB) error {
		for _, group := range []struct {
			name     string
			children []string
		}{{appCategory, appSubCategories}, {infraCategory, infraSubCategories}} {
			parent := Category{Name: group.name}
			if err := tx.Where("name = ? AND parent_id IS NULL", group.name).FirstOrCreate(&parent).Error; err != nil {
				return err
			}
			for _, name := range group.children {
				child := Category{Name: name, ParentId: &parent.ID, FullName: parent.Name + "-" + name}
				if err := tx.Where("name = ? AND parent_id = ?", name, parent.ID).FirstOrCreate(&child).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
}
