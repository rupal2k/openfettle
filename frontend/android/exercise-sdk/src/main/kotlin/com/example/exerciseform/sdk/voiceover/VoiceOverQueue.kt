package com.example.exerciseform.sdk.voiceover

import android.content.Context
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.withTimeoutOrNull
import java.util.Locale

/** Small lifecycle-owned TTS queue for camera coaching feedback. */
class VoiceOverQueue(context: Context) {
    private val pending = ArrayDeque<String>()
    private var tts: TextToSpeech? = null
    private var ready = false
    private var enabled = true
    private val readySignal = CompletableDeferred<Boolean>()
    private val waiting = mutableMapOf<String, CompletableDeferred<Unit>>()

    init {
        tts = TextToSpeech(context.applicationContext) { status ->
            ready = status == TextToSpeech.SUCCESS
            if (ready) {
                tts?.language = Locale.US
                tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
                    override fun onStart(utteranceId: String) = Unit
                    override fun onDone(utteranceId: String) { waiting.remove(utteranceId)?.complete(Unit) }
                    override fun onError(utteranceId: String) { waiting.remove(utteranceId)?.complete(Unit) }
                })
                flush()
            }
            if (!ready && !readySignal.isCompleted) readySignal.complete(false)
            else if (ready && !readySignal.isCompleted) readySignal.complete(true)
        }
    }

    fun setEnabled(value: Boolean) {
        enabled = value
        if (!value) {
            pending.clear()
            tts?.stop()
            waiting.values.toList().forEach { it.complete(Unit) }
            waiting.clear()
        }
    }

    suspend fun sayAndWait(text: String) {
        if (!enabled || text.isBlank()) return
        val initialized = if (ready) true else withTimeoutOrNull(3_000L) { readySignal.await() } == true
        if (!initialized || !enabled) return
        val utteranceId = "coach-${System.nanoTime()}"
        val completion = CompletableDeferred<Unit>()
        waiting[utteranceId] = completion
        tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId)
        withTimeoutOrNull((text.length * 75L).coerceIn(1_500L, 8_000L)) { completion.await() }
        waiting.remove(utteranceId)
    }

    fun say(text: String) {
        if (!enabled) return
        if (!ready) {
            pending.addLast(text)
            return
        }
        tts?.speak(text, TextToSpeech.QUEUE_ADD, null, "coach-${System.nanoTime()}")
    }

    private fun flush() {
        while (enabled && pending.isNotEmpty()) say(pending.removeFirst())
    }

    fun close() {
        pending.clear()
        tts?.stop()
        tts?.shutdown()
        tts = null
        ready = false
    }
}
