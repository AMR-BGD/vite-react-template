package app.lumio.tv

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.KeyEvent
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.ui.PlayerView

/** Full-screen ExoPlayer: plays the queue handed over by the web interface. */
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
class PlayerActivity : Activity() {
    private lateinit var player: ExoPlayer
    private lateinit var view: PlayerView
    private lateinit var title: TextView
    private lateinit var subtitle: TextView
    private lateinit var message: TextView
    private val items get() = Session.items

    /** Streams already retried as HLS (live URLs without extension can be either TS or HLS). */
    private val retried = HashSet<String>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (items.isEmpty()) return finish()
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // IPTV servers often redirect between http and https.
        val http = DefaultHttpDataSource.Factory().setAllowCrossProtocolRedirects(true)
        player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(DefaultMediaSourceFactory(this).setDataSourceFactory(http))
            .build()

        view = PlayerView(this).apply {
            player = this@PlayerActivity.player
            setShowNextButton(items.size > 1)
            setShowPreviousButton(items.size > 1)
            setControllerVisibilityListener(PlayerView.ControllerVisibilityListener { v -> header.visibility = v })
        }
        setContentView(FrameLayout(this).apply {
            setBackgroundColor(Color.BLACK)
            addView(view)
            addView(header)
            addView(message)
        })

        player.addListener(listener)
        player.setMediaItems(items.map(::mediaItem), Session.index, Session.positionMs)
        player.playWhenReady = true
        player.prepare()
        showTitle()
        view.requestFocus()
    }

    private val header by lazy {
        title = TextView(this).apply { textSize = 22f; setTextColor(Color.WHITE) }
        subtitle = TextView(this).apply { textSize = 14f; setTextColor(0xFFB8C0CF.toInt()) }
        message = TextView(this).apply {
            textSize = 18f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setBackgroundColor(0xCC000000.toInt())
            visibility = View.GONE
        }
        LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 32, 48, 32)
            addView(title)
            addView(subtitle)
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.TOP,
            )
        }
    }

    private fun mediaItem(item: Item, forceHls: Boolean = false): MediaItem {
        val b = MediaItem.Builder()
            .setMediaId(item.id)
            .setUri(item.url)
            .setMediaMetadata(MediaMetadata.Builder().setTitle(item.title).build())
        if (forceHls) b.setMimeType(MimeTypes.APPLICATION_M3U8)
        return b.build()
    }

    private fun current() = items.getOrNull(player.currentMediaItemIndex)

    private fun showTitle() {
        val item = current() ?: return
        title.text = item.title
        subtitle.text = if (item.live) "● En direct · ${item.subtitle}" else item.subtitle
        message.visibility = View.GONE
    }

    private val listener = object : Player.Listener {
        override fun onMediaItemTransition(mediaItem: MediaItem?, reason: Int) {
            showTitle()
            view.showController()
        }

        override fun onPositionDiscontinuity(old: Player.PositionInfo, new: Player.PositionInfo, reason: Int) {
            // Leaving an item (next episode, zapping): remember where we were.
            if (old.mediaItemIndex != new.mediaItemIndex) save(old.mediaItemIndex, old.positionMs)
        }

        override fun onPlaybackStateChanged(state: Int) {
            if (state == Player.STATE_READY) {
                durations[player.currentMediaItemIndex] = player.duration
                message.visibility = View.GONE
            }
            if (state == Player.STATE_ENDED) finish()
        }

        override fun onPlayerError(error: PlaybackException) {
            val item = current() ?: return
            val index = player.currentMediaItemIndex
            val hasExtension = item.url.substringBefore('?').substringAfterLast('/').contains('.')
            if (item.live && !hasExtension && retried.add(item.id)) {
                player.replaceMediaItem(index, mediaItem(item, forceHls = true))
                player.prepare()
                return
            }
            message.text = "Impossible de lire « ${item.title} »\n\n" +
                "Le flux est peut-être hors ligne.\n" +
                (if (items.size > 1) "Haut / Bas pour changer, Retour pour quitter." else "Retour pour quitter.")
            message.visibility = View.VISIBLE
        }
    }

    private val durations = HashMap<Int, Long>()

    private fun save(index: Int, positionMs: Long) {
        val item = items.getOrNull(index) ?: return
        val duration = durations[index] ?: return
        if (!item.live && duration > 0) Session.record(item.id, positionMs, duration)
    }

    private fun zap(delta: Int) {
        val next = player.currentMediaItemIndex + delta
        if (next !in items.indices) return
        player.seekTo(next, 0)
        player.prepare()
        player.play()
    }

    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.action == KeyEvent.ACTION_DOWN) {
            val live = current()?.live == true
            val idle = !view.isControllerFullyVisible || message.visibility == View.VISIBLE
            when (event.keyCode) {
                KeyEvent.KEYCODE_CHANNEL_UP, KeyEvent.KEYCODE_MEDIA_NEXT -> return true.also { zap(1) }
                KeyEvent.KEYCODE_CHANNEL_DOWN, KeyEvent.KEYCODE_MEDIA_PREVIOUS -> return true.also { zap(-1) }
                // On live TV, Up/Down zap while the controls are hidden.
                KeyEvent.KEYCODE_DPAD_UP -> if (live && idle) return true.also { zap(1) }
                KeyEvent.KEYCODE_DPAD_DOWN -> if (live && idle) return true.also { zap(-1) }
            }
        }
        return super.dispatchKeyEvent(event)
    }

    override fun onStop() {
        super.onStop()
        if (::player.isInitialized) {
            save(player.currentMediaItemIndex, player.currentPosition)
            player.pause()
        }
    }

    override fun onStart() {
        super.onStart()
        if (::player.isInitialized) player.play()
    }

    override fun onDestroy() {
        super.onDestroy()
        if (::player.isInitialized) player.release()
    }
}
