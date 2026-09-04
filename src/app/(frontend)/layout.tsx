import React from 'react'
import './styles.css'

export const metadata = {
  description: 'Overprint - print-on-demand t-shirts, printed to order.',
  title: 'Overprint',
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
