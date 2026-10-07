package models

import "gorm.io/gorm"

var db *gorm.DB

// BindDatabase is called once, before accepting requests, never during import.
func BindDatabase(connection *gorm.DB) { db = connection }

// MigrateSchema is an explicit release command, not a cold-start action.
func MigrateSchema() error {
	return db.AutoMigrate(
		&Permission{}, &PermissionGroup{}, &Role{}, &User{}, &Event{}, &Recap{},
		&Article{}, &Testnet{}, &Category{}, &Dapp{}, &Tutorial{}, &Feedback{},
		&Post{}, &PostLike{}, &PostFavorite{}, &DailyStats{}, &Follow{},
		&Session{}, &Agenda{}, &Speaker{}, &VolunteerCategory{}, &Volunteer{},
		&Gift{}, &Community{}, &Member{},
		&CaptchaChallenge{}, &RegistrationProof{}, &AuthRateBucket{},
	)
}
