package controllers

import (
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
	"kaiyuanshe/models"
	"kaiyuanshe/utils"
)

func GenerateCaptcha(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	answer, imageData, err := utils.GenerateCaptchaImage()
	if err != nil {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Verification is temporarily unavailable", nil)
		return
	}
	id, err := models.CreateCaptchaChallenge(c.Request.Context(), answer)
	if err != nil {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Verification is temporarily unavailable", nil)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{"captchaId": id, "imageData": imageData})
}

func VerifyCaptcha(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	var request struct {
		ID     string `json:"captchaId" binding:"required,len=32"`
		Answer string `json:"captcha" binding:"required,max=16"`
		Email  string `json:"email" binding:"required,email,max=254"`
	}
	if err := c.ShouldBindJSON(&request); err != nil {
		utils.ErrorResponse(c, http.StatusBadRequest, "Please enter the email and verification code", nil)
		return
	}
	proof, err := models.VerifyCaptchaChallenge(c.Request.Context(), request.ID, request.Answer, request.Email)
	if errors.Is(err, models.ErrInvalidCaptcha) {
		utils.ErrorResponse(c, http.StatusBadRequest, "The verification code is incorrect or expired", nil)
		return
	}
	if err != nil {
		utils.ErrorResponse(c, http.StatusServiceUnavailable, "Verification is temporarily unavailable", nil)
		return
	}
	utils.SuccessResponse(c, http.StatusOK, "success", gin.H{"verificationToken": proof})
}
