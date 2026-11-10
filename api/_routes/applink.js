// The iPhone app's Google sign-in ends here. The app starts the sign-in itself (so
// it holds the challenge cookie), Google and Neon Auth send the browser sheet to
// this address with a one-time verifier, and this hands the verifier back to the
// app through its own URL scheme. The verifier is useless without the app's cookie.
export default function applink(req, res) {
  const q = new URL(req.url, 'http://local').searchParams
  q.delete('fn')
  res.statusCode = 302
  res.setHeader('Location', `sceneshare://auth?${q.toString()}`)
  res.setHeader('Cache-Control', 'no-store')
  res.end()
}
