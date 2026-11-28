package com.example.exerciseform.sdk.api

import android.content.Context
import com.example.exerciseform.sdk.biomechanics.BiomechanicsEngine
import com.example.exerciseform.sdk.biomechanics.PoseQualityGate
import com.example.exerciseform.sdk.pose.UnavailablePoseProcessor
import com.example.exerciseform.sdk.pose.PoseProcessor
import com.example.exerciseform.sdk.physics.SkeletalPhysicsEngine
import com.example.exerciseform.sdk.movementobserver.CompositeMovementObserver
import com.example.exerciseform.sdk.movementobserver.MovementFrame
import com.example.exerciseform.sdk.movementscoring.TemporalMovementScoringEngine
import com.example.exerciseform.sdk.smoothing.*
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.*
import java.util.concurrent.atomic.AtomicLong

class ExerciseFormEngine internal constructor(private val context: Context, private val config: ExerciseFormConfig) : java.io.Closeable {
    // Keep the camera bridge single-threaded so smoothing and biomechanics stay ordered.
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default.limitedParallelism(1))
    private val poseChannel = Channel<PoseFrame>(Channel.CONFLATED)
    private val poseBridge = scope.launch {
        for (frame in poseChannel) processPose(frame)
    }
    private val _results = MutableStateFlow<SdkResult?>(null)
    val results: StateFlow<SdkResult?> = _results.asStateFlow()
    private val smoother: LandmarkSmoother = if (config.smoothing == SmoothingType.SMA) SmaSmoother(config.smaWindow) else EmaSmoother(config.emaAlpha)
    private val biomechanics = BiomechanicsEngine(config.minLandmarkConfidence)
    private val poseQualityGate = config.poseQualityGateAssetPath?.let { PoseQualityGate.fromAssets(context, it) }
    private val physicsEngine = SkeletalPhysicsEngine(config.physics)
    val physicsResults = physicsEngine.results
    private val movementObserver = CompositeMovementObserver(config.movementObserver)
    val movementObserverResults = movementObserver.results
    private val movementScoring = TemporalMovementScoringEngine(config.movementScoring)
    val movementScoringResults = movementScoring.results
    private val scoringBridgeScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val scoringBridge = scoringBridgeScope.launch {
        movementObserver.results.collect { movementScoring.submit(it) }
    }
    private val processor: PoseProcessor = UnavailablePoseProcessor()
    private var running = false
    private val lastAcceptedTimestampNs = AtomicLong(Long.MIN_VALUE)
    private var last: PoseFrame? = null
    private var lastTimestampNs = 0L

    fun start() { check(scope.coroutineContext[Job]?.isCancelled != true) { "Engine is closed" }; running = true; movementObserver.start(); movementScoring.start() }
    fun stop() { running = false; lastAcceptedTimestampNs.set(Long.MIN_VALUE); poseQualityGate?.reset(); smoother.reset(); physicsEngine.reset(); movementObserver.reset(); movementScoring.reset(); last = null; lastTimestampNs = 0L; _results.value = null }

    /** Submit pose landmarks; geometry and metrics stay inside the SDK. */
    fun submitPose(frame: PoseFrame) {
        if (!running || poseQualityGate?.accepts(frame, config.minLandmarkConfidence) == false) return
        val intervalNs = 1_000_000_000L / config.maxProcessingFps.coerceAtLeast(1)
        while (true) {
            val previous = lastAcceptedTimestampNs.get()
            if (previous != Long.MIN_VALUE && frame.timestampNs <= previous) return
            if (previous != Long.MIN_VALUE && frame.timestampNs - previous < intervalNs) return
            if (lastAcceptedTimestampNs.compareAndSet(previous, frame.timestampNs)) break
        }
        poseChannel.trySend(frame)
    }

    private suspend fun processPose(frame: PoseFrame) {
        if (!running) return
        val started = System.nanoTime()
        val smoothed = smoother.smooth(frame, config.minLandmarkConfidence)
        physicsEngine.submit(smoothed)
        val dt = if (lastTimestampNs == 0L) 1f / config.maxProcessingFps else ((smoothed.timestampNs - lastTimestampNs).coerceAtLeast(1L) / 1_000_000_000f).coerceAtMost(1f)
        val (metrics, features) = biomechanics.extract(smoothed, last, dt)
        movementObserver.submit(MovementFrame.from(smoothed.timestampNs, metrics, config.minLandmarkConfidence))
        _results.value = SdkResult(smoothed, metrics, (System.nanoTime() - started) / 1_000_000, config.maxProcessingFps.toFloat())
        last = smoothed
        lastTimestampNs = smoothed.timestampNs
    }
    suspend fun submitFrame(frame: FrameInput) { processor.process(frame)?.let(::submitPose) }
    fun startMovementRecording() = movementObserver.startRecording()
    fun stopMovementRecording(): String = movementObserver.stopRecording()
    fun exportMovementRecordingJson(): String = movementObserver.exportJson()
    fun startMovementScoringRecording() = movementScoring.startRecording()
    fun stopMovementScoringRecording(): String = movementScoring.stopRecording()
    fun exportMovementScoringJson(): String = movementScoring.exportJson()
    fun resetMovementObserver() { movementObserver.resetTracking(); movementScoring.reset() }
    override fun close() { running = false; lastAcceptedTimestampNs.set(Long.MIN_VALUE); processor.close(); physicsEngine.close(); movementObserver.close(); movementScoring.close(); poseChannel.close(); scoringBridge.cancel(); scoringBridgeScope.cancel(); poseBridge.cancel(); scope.cancel() }
    companion object { fun create(context: Context, config: ExerciseFormConfig = ExerciseFormConfig()) = ExerciseFormEngine(context.applicationContext, config) }
}

object ExerciseFormSdk { fun create(context: Context, config: ExerciseFormConfig = ExerciseFormConfig()) = ExerciseFormEngine.create(context, config) }
