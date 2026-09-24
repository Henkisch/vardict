'use client'

import QRCode from 'qrcode'
import {useEffect, useState} from 'react'

// A QR code pointing at /live (where you vote) on whatever host serves this page.
export function QrCode({path = '/live'}: {path?: string}) {
  const [src, setSrc] = useState<string>()
  const [url, setUrl] = useState<string>()
  useEffect(() => {
    const target = new URL(path, window.location.origin).toString()
    QRCode.toDataURL(target, {margin: 1, width: 320, color: {dark: '#0b0f0c', light: '#eef3ec'}}).then((data) => {
      setUrl(target)
      setSrc(data)
    })
  }, [path])
  return (
    <figure className="hidden flex-col items-center gap-2 lg:flex">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`QR code for ${url}`} className="h-40 w-40 rounded-md" />
      ) : (
        <div className="h-40 w-40 rounded-md bg-pitch" />
      )}
      <figcaption className="text-center text-sm text-muted">
        Scan to vote on your phone
        <br />
        <span className="text-chalk">{url?.replace(/^https?:\/\//, '')}</span>
      </figcaption>
    </figure>
  )
}
