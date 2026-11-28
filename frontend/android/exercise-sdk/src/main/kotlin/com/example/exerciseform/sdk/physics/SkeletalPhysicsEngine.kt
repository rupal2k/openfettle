package com.example.exerciseform.sdk.physics

import com.example.exerciseform.sdk.api.PoseFrame
import com.example.exerciseform.sdk.api.PoseLandmark
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** SDK-owned latest-frame physics pipeline. It never runs on the camera thread. */
class SkeletalPhysicsEngine(
    private val config: SkeletalPhysicsConfig = SkeletalPhysicsConfig()
) : AutoCloseable {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val input = Channel<PhysicsSnapshot>(Channel.CONFLATED)
    private val _results = MutableStateFlow(SkeletalPhysicsResult(gravityDirection = config.gravityDirection))
    val results: StateFlow<SkeletalPhysicsResult> = _results.asStateFlow()
    private var previous: PhysicsSnapshot? = null
    private var previousPrevious: PhysicsSnapshot? = null
    private var previousPreviousPrevious: PhysicsSnapshot? = null
    private val worldSmoothed = mutableMapOf<Int, PoseLandmark>()
    private var lastProcessedNs = Long.MIN_VALUE
    private val worker = scope.launch {
        for (snapshot in input) {
            val intervalNs = 1_000_000_000L / config.processingHz.coerceAtLeast(1)
            if (lastProcessedNs != Long.MIN_VALUE && snapshot.timestampNs - lastProcessedNs < intervalNs) continue
            val smoothed = smoothWorld(snapshot)
            val prepared = snapshot.copy(landmarks = if (smoothed.size >= 3) smoothed else snapshot.landmarks)
            _results.value = SkeletalPhysicsCalculator.calculate(prepared, previous, previousPrevious, previousPreviousPrevious, config)
            previousPreviousPrevious = previousPrevious
            previousPrevious = previous
            previous = snapshot
            lastProcessedNs = snapshot.timestampNs
        }
    }

    fun submit(frame: PoseFrame) {
        // Only copy/enqueue here. Smoothing and all physics calculations stay on the worker.
        val immutable = PhysicsSnapshot(frame.timestampNs, frame.worldLandmarks.toList().ifEmpty { frame.landmarks.toList() }, frame.landmarks.size, frame.worldLandmarks.size)
        input.trySend(immutable)
    }

    private fun smoothWorld(snapshot: PhysicsSnapshot): List<PoseLandmark> {
        if (snapshot.worldLandmarkCount < 3) return emptyList()
        return snapshot.landmarks.map { landmark ->
            val old = worldSmoothed[landmark.index]
            val alpha = .35f
            val smoothed = if (old == null) landmark else landmark.copy(
                x = old.x + alpha * (landmark.x - old.x),
                y = old.y + alpha * (landmark.y - old.y),
                z = old.z + alpha * (landmark.z - old.z)
            )
            worldSmoothed[landmark.index] = smoothed
            smoothed
        }
    }

    fun reset() {
        previous = null
        previousPrevious = null
        previousPreviousPrevious = null
        worldSmoothed.clear()
        lastProcessedNs = Long.MIN_VALUE
        _results.value = SkeletalPhysicsResult(gravityDirection = config.gravityDirection)
    }

    override fun close() {
        input.close()
        worker.cancel()
        scope.cancel()
    }
}
