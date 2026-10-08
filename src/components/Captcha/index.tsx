'use client'
import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react'
import Image from 'next/image'
import { RefreshCw } from 'lucide-react'
import styles from './index.module.css'
import { useTranslation } from '@/hooks/useTranslation'

interface CaptchaProps {
  width?: number
  height?: number
  onChange?: (captchaId: string) => void
  onRefresh?: () => void
}

interface CaptchaData {
  captchaId: string
  imageData: string
}

export interface CaptchaRef {
  refreshCaptcha: () => void
}

const Captcha = forwardRef<CaptchaRef, CaptchaProps>(({
  width = 120,
  height = 40,
  onChange,
  onRefresh
}, ref) => {
  const { locale } = useTranslation()
  const label = locale === 'en' ? 'Refresh verification code' : '刷新验证码'
  const imgRef = useRef<HTMLDivElement>(null)
  const requestNumber = useRef(0)
  const [captchaData, setCaptchaData] = useState<CaptchaData | null>(null)
  const [loading, setLoading] = useState(false)

  // 获取验证码
  const fetchCaptcha = React.useCallback(async () => {
    const currentRequest = ++requestNumber.current
    try {
      setLoading(true)
      setCaptchaData(null)
      onChange?.('')
      const response = await fetch('/api/captcha/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(10000)
      })

      const result = await response.json()

      if (currentRequest !== requestNumber.current) return
      if (response.ok && result.code === 200 &&
          typeof result.data?.captchaId === 'string' &&
          result.data?.imageData?.startsWith('data:image/png;base64,')) {
        setCaptchaData(result.data)
        onChange?.(result.data.captchaId)
      }
    } catch {
      // No fallback challenge or client-side bypass if the backend is down.
    } finally {
      if (currentRequest === requestNumber.current) setLoading(false)
    }
  }, [onChange])

  // 刷新验证码
  const refreshCaptcha = () => {
    fetchCaptcha()
    onRefresh?.()
  }

  // 暴露给父组件的方法
  useImperativeHandle(ref, () => ({
    refreshCaptcha
  }), [fetchCaptcha, onRefresh])

  // 初始化
  useEffect(() => {
    fetchCaptcha()
    return () => { requestNumber.current++ }
  }, [fetchCaptcha])

  return (
    <div className={styles.captchaContainer}>
      {captchaData ? (
        <div 
          ref={imgRef}
          className={styles.captchaCanvas}
          onClick={refreshCaptcha}
          role="button"
          tabIndex={0}
          aria-label={label}
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); refreshCaptcha() } }}
          style={{ cursor: 'pointer', width, height }}
        >
          <Image
            src={captchaData.imageData}
            alt={locale === 'en' ? 'Verification code' : '验证码'}
            width={width}
            height={height}
            unoptimized
          />
        </div>
      ) : (
        <div 
          className={styles.captchaCanvas}
          style={{ 
            width, 
            height, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            backgroundColor: '#f0f0f0',
            color: '#999'
          }}
        >
          {loading ? (locale === 'en' ? 'Loading…' : '加载中…') : (locale === 'en' ? 'Unavailable' : '暂不可用')}
        </div>
      )}
      <button
        type="button"
        className={styles.refreshButton}
        onClick={refreshCaptcha}
        title={label}
        aria-label={label}
        disabled={loading}
      >
        <RefreshCw size={16} />
      </button>
    </div>
  )
})

Captcha.displayName = 'Captcha'

export default Captcha
