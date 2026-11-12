package app.lumio.tv

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.view.KeyEvent
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import java.io.ByteArrayInputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Hosts the web interface (bundled in assets/www) and stands in for the
 * Cloudflare Worker: /api/playlist and /api/stream are answered natively.
 */
class MainActivity : Activity() {
    private lateinit var web: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        web = WebView(this)
        setContentView(web)
        web.setBackgroundColor(0xFF0A0C12.toInt())
        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        }
        web.addJavascriptInterface(Bridge(), "AndroidTV")
        web.webViewClient = Client()
        if (savedInstanceState == null) web.loadUrl("https://$HOST/") else web.restoreState(savedInstanceState)
        web.requestFocus()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onResume() {
        super.onResume()
        // Coming back from the player: hand over what was watched.
        Session.drain()?.let { web.evaluateJavascript("window.__nativeProgress && window.__nativeProgress($it)", null) }
        web.requestFocus()
    }

    /** Back closes the top-most panel of the web interface, and leaves the app at the root. */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode == KeyEvent.KEYCODE_BACK) {
            if (event.action == KeyEvent.ACTION_UP) {
                web.evaluateJavascript("window.__back ? window.__back() : false") { handled ->
                    if (handled != "true") finish()
                }
            }
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    inner class Bridge {
        @JavascriptInterface
        fun play(json: String) {
            Session.load(json)
            if (Session.items.isNotEmpty()) startActivity(Intent(this@MainActivity, PlayerActivity::class.java))
        }
    }

    inner class Client : WebViewClient() {
        // The app never navigates away from its own pages.
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) =
            request.url.host != HOST

        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
            val uri = request.url
            if (uri.host != HOST) return null
            val path = uri.path ?: "/"
            return if (path == "/api/playlist" || path == "/api/stream") {
                relay(uri.getQueryParameter("url"), request.requestHeaders["User-Agent"])
            } else {
                asset(path)
            }
        }
    }

    private fun asset(path: String): WebResourceResponse {
        val name = path.trimStart('/')
        val stream = try {
            assets.open("www/$name")
        } catch (e: Exception) {
            return WebResourceResponse("text/html", "utf-8", assets.open("www/index.html"))
        }
        val mime = MIME[name.substringAfterLast('.', "")] ?: "application/octet-stream"
        return WebResourceResponse(mime, if (mime.startsWith("text/")) "utf-8" else null, stream)
    }

    /** Fetch a remote playlist or image for the page (no CORS, http allowed). */
    private fun relay(target: String?, userAgent: String?): WebResourceResponse {
        try {
            var url = URL(target)
            repeat(6) {
                if (url.protocol != "http" && url.protocol != "https") return error(400, "Bad Request")
                val c = url.openConnection() as HttpURLConnection
                c.instanceFollowRedirects = false
                c.connectTimeout = 15_000
                c.readTimeout = 30_000
                if (userAgent != null) c.setRequestProperty("User-Agent", userAgent)
                val code = c.responseCode
                if (code in 300..399) {
                    val next = c.getHeaderField("Location") ?: return error(502, "Bad Gateway")
                    c.disconnect()
                    url = URL(url, next)
                    return@repeat
                }
                if (code !in 200..299) {
                    c.disconnect()
                    return error(502, "Bad Gateway", "Le serveur a répondu $code")
                }
                val type = (c.contentType ?: "text/plain").substringBefore(';').trim()
                return WebResourceResponse(type, if (type.startsWith("text/")) "utf-8" else null, c.inputStream)
            }
            return error(502, "Bad Gateway", "Trop de redirections")
        } catch (e: Exception) {
            return error(502, "Bad Gateway", "Impossible de joindre le serveur")
        }
    }

    private fun error(code: Int, reason: String, message: String = reason) = WebResourceResponse(
        "text/plain", "utf-8", code, reason, emptyMap(), ByteArrayInputStream(message.toByteArray()),
    )

    companion object {
        // Reserved by Google for apps serving local content; never resolves on the network.
        const val HOST = "appassets.androidplatform.net"

        val MIME = mapOf(
            "html" to "text/html",
            "js" to "text/javascript",
            "css" to "text/css",
            "json" to "application/json",
            "svg" to "image/svg+xml",
            "png" to "image/png",
            "jpg" to "image/jpeg",
            "webp" to "image/webp",
            "woff2" to "font/woff2",
        )
    }
}
