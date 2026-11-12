package app.lumio.tv

import org.json.JSONArray
import org.json.JSONObject

class Item(val id: String, val title: String, val subtitle: String, val url: String, val live: Boolean)

/**
 * What the web interface asked to play, and what was watched.
 * Kept in memory rather than in Intent extras, which are limited to ~1 MB.
 */
object Session {
    var items: List<Item> = emptyList()
    var index = 0
    var positionMs = 0L

    private val watched = LinkedHashMap<String, Pair<Long, Long>>()

    fun load(json: String) {
        val o = JSONObject(json)
        val arr = o.getJSONArray("items")
        items = List(arr.length()) {
            val i = arr.getJSONObject(it)
            Item(
                i.getString("id"),
                i.optString("title"),
                i.optString("subtitle"),
                i.getString("url"),
                i.optBoolean("live"),
            )
        }
        index = o.optInt("index").coerceIn(0, maxOf(0, items.size - 1))
        positionMs = o.optLong("positionMs")
    }

    @Synchronized
    fun record(id: String, positionMs: Long, durationMs: Long) {
        if (durationMs > 60_000 && positionMs > 5_000) watched[id] = positionMs to durationMs
    }

    /** Progress as JSON for the web interface (seconds), then forget it. */
    @Synchronized
    fun drain(): String? {
        if (watched.isEmpty()) return null
        val arr = JSONArray()
        for ((id, p) in watched) {
            arr.put(JSONObject().put("id", id).put("t", p.first / 1000.0).put("d", p.second / 1000.0))
        }
        watched.clear()
        return arr.toString()
    }
}
