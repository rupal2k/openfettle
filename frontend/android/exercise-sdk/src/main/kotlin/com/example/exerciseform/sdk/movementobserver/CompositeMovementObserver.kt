package com.example.exerciseform.sdk.movementobserver

import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlin.math.*

private val OBSERVED_JOINTS = listOf("left.knee", "right.knee", "left.hip", "right.hip", "left.elbow", "right.elbow", "left.shoulder", "right.shoulder", "left.ankle", "right.ankle")
private val COORDINATION_PAIRS = listOf("left.shoulder" to "left.elbow", "right.shoulder" to "right.elbow", "left.hip" to "left.knee", "right.hip" to "right.knee", "left.knee" to "left.ankle", "right.knee" to "right.ankle")

class LocalLinearityObserver(private val windowMs: Long = 500L) {
    fun observe(frames: List<MovementFrame>): Map<String, LinearityMetric> = OBSERVED_JOINTS.associateWith { name ->
        val points = series(frames, name, windowMs)
        if (points.size < 3) LinearityMetric() else {
            val x = points.map { (it.first - points.last().first) / 1_000_000_000f }
            val y = points.map { it.second }
            val meanX = x.average().toFloat(); val meanY = y.average().toFloat()
            var xx = 0f; var xy = 0f; var total = 0f
            for (i in y.indices) { val dx = x[i] - meanX; val dy = y[i] - meanY; xx += dx * dx; xy += dx * dy; total += dy * dy }
            val slope = if (xx <= 1e-8f) 0f else xy / xx
            val intercept = meanY - slope * meanX
            var residualSquared = 0f; var maxResidual = 0f
            for (i in y.indices) { val residual = abs(y[i] - (intercept + slope * x[i])); residualSquared += residual * residual; maxResidual = max(maxResidual, residual) }
            val r2 = if (total <= 1e-5f) 1f else (1f - residualSquared / total).coerceIn(0f, 1f)
            LinearityMetric(slope, r2, sqrt(residualSquared / y.size), maxResidual)
        }
    }
}

class MovementSmoothnessObserver(private val windowMs: Long = 5_000L) {
    fun observe(frames: List<MovementFrame>): Map<String, SmoothnessMetric> = OBSERVED_JOINTS.associateWith { name ->
        val points = series(frames, name, windowMs)
        if (points.size < 2) SmoothnessMetric() else {
            val velocities = points.zipWithNext().mapNotNull { (a, b) -> derivative(a, b) }
            val accelerations = velocities.zipWithNext().mapNotNull { (a, b) -> derivative(a, b) }
            val jerks = accelerations.zipWithNext().mapNotNull { (a, b) -> derivative(a, b) }
            SmoothnessMetric(velocities.lastOrNull()?.second, accelerations.lastOrNull()?.second, jerks.lastOrNull()?.second, rms(velocities.map { it.second }), rms(accelerations.map { it.second }), rms(jerks.map { it.second }), jerks.maxOfOrNull { abs(it.second) })
        }
    }
}

class JointCoordinationObserver(private val lagWindowMs: Long = 500L) {
    fun observe(frames: List<MovementFrame>): List<CoordinationMetric> = COORDINATION_PAIRS.map { (first, second) ->
        val a = velocitySeries(frames, first); val b = velocitySeries(frames, second)
        if (a.size < 4 || b.size < 4) CoordinationMetric(first, second) else {
            val stepMs = medianStepMs(a.map { it.first }).coerceAtLeast(1L)
            val maxLag = (lagWindowMs / stepMs).toInt().coerceAtLeast(1)
            var bestCorrelation = 0f; var bestLag = 0
            for (lag in -maxLag..maxLag) {
                val pairs = aligned(a.map { it.second }, b.map { it.second }, lag)
                val correlation = pearson(pairs.first, pairs.second) ?: continue
                if (abs(correlation) > abs(bestCorrelation)) { bestCorrelation = correlation; bestLag = lag }
            }
            CoordinationMetric(first, second, pearson(a.map { it.second }, b.map { it.second }), abs(bestCorrelation), bestCorrelation, bestLag * stepMs)
        }
    }
}

class AngularStabilityObserver(private val windowMs: Long = 5_000L) {
    fun observe(frames: List<MovementFrame>): Map<String, StabilityMetric> = OBSERVED_JOINTS.associateWith { name ->
        val values = series(frames, name, windowMs).map { it.second }
        if (values.isEmpty()) StabilityMetric() else {
            val mean = values.average().toFloat(); val variance = values.map { (it - mean).pow(2) }.average().toFloat(); val sorted = values.sorted(); val median = sorted[sorted.size / 2]; val mad = sorted.map { abs(it - median) }.sorted().let { it[it.size / 2] }
            StabilityMetric(mean, sqrt(variance), variance, values.minOrNull(), values.maxOrNull(), (values.maxOrNull() ?: 0f) - (values.minOrNull() ?: 0f), mad)
        }
    }
}

class CompositeContinuityObserver(private val windowMs: Long = 5_000L) {
    fun observe(frames: List<MovementFrame>): ContinuityMetric {
        if (frames.size < 2) return ContinuityMetric()
        val pairs = frames.zipWithNext().mapNotNull { (a, b) ->
            val common = a.anglesDegrees.keys.intersect(b.anglesDegrees.keys).filter { a.anglesDegrees[it]?.isFinite() == true && b.anglesDegrees[it]?.isFinite() == true }
            if (common.isEmpty()) null else Triple(a, b, common)
        }
        val latest = pairs.lastOrNull() ?: return ContinuityMetric()
        val (previous, current, common) = latest
        val dt = ((current.timestampNs - previous.timestampNs).coerceAtLeast(1L)) / 1_000_000_000f
        val deltas = common.associateWith { (current.anglesDegrees[it]!! - previous.anglesDegrees[it]!!) }
        val displacement = sqrt(deltas.values.map { it * it }.average()).toFloat()
        val rate = displacement / dt
        val rates = pairs.map { (a, b, joints) ->
            val seconds = ((b.timestampNs - a.timestampNs).coerceAtLeast(1L)) / 1_000_000_000f
            sqrt(joints.map { (b.anglesDegrees[it]!! - a.anglesDegrees[it]!!).pow(2) }.average()).toFloat() / seconds
        }
        val acceleration = if (rates.size >= 2) (rates.last() - rates[rates.lastIndex - 1]) / dt else null
        val jerk = if (rates.size >= 3) (rates.last() - 2f * rates[rates.lastIndex - 1] + rates[rates.lastIndex - 2]) / (dt * dt) else null
        val contributions = deltas.mapValues { (_, value) -> value * value / max(deltas.values.sumOf { it.toDouble() }.toFloat(), 1e-6f) }
        val recent = rates.takeLast((windowMs / 33L).toInt().coerceAtLeast(2))
        return ContinuityMetric(displacement, rate, acceleration, jerk, recent.average().toFloat(), rms(recent), rates.maxOrNull(), contributions, common.size.toFloat() / OBSERVED_JOINTS.size * 100f)
    }
}

class TrackingReliabilityObserver {
    fun observe(frames: List<MovementFrame>, rejected: Int): TrackingReliability {
        val latest = frames.lastOrNull() ?: return TrackingReliability(droppedOrInvalidObservations = rejected)
        val valid = latest.validJointCount
        val intervals = frames.zipWithNext().map { (a, b) -> (b.timestampNs - a.timestampNs) / 1_000_000f }.filter { it > 0f }
        val duration = ((latest.timestampNs - (frames.firstOrNull()?.timestampNs ?: latest.timestampNs)).coerceAtLeast(0L)) / 1_000_000L
        return TrackingReliability(latest.confidence.values.filter { it.isFinite() }.average().takeIf { !it.isNaN() }?.toFloat(), valid, valid.toFloat() / OBSERVED_JOINTS.size * 100f, (1f - valid.toFloat() / OBSERVED_JOINTS.size) * 100f, if (duration > 0) (frames.size - 1) / (duration / 1000f) else null, intervals.takeIf { it.size > 1 }?.let { standardDeviation(it) }, rejected, duration)
    }
}

class CompositeMovementObserver(private val config: MovementObserverConfig = MovementObserverConfig()) : AutoCloseable {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val input = Channel<MovementFrame>(Channel.CONFLATED)
    private val history = MovementHistoryBuffer(config.historyDurationMs, config.maxHistoryFrames)
    private val _results = MutableStateFlow(MovementObserverResult())
    val results: StateFlow<MovementObserverResult> = _results.asStateFlow()
    private val linearity = LocalLinearityObserver(config.localRegressionWindowMs)
    private val smoothness = MovementSmoothnessObserver(config.historyDurationMs)
    private val coordination = JointCoordinationObserver(config.coordinationLagMs)
    private val stability = AngularStabilityObserver(config.historyDurationMs)
    private val continuity = CompositeContinuityObserver(config.historyDurationMs)
    private val reliability = TrackingReliabilityObserver()
    private var worker: Job? = null
    private var rejected = 0
    private var recording = false
    private val recorded = ArrayDeque<MovementObserverResult>()
    private val rateHistory = ArrayDeque<Float>()
    private val accelerationHistory = ArrayDeque<Float>()
    private val jerkHistory = ArrayDeque<Float>()
    private val jointVelocityHistory = mutableMapOf<String, ArrayDeque<Float>>()
    private val jointAccelerationHistory = mutableMapOf<String, ArrayDeque<Float>>()
    private val jointJerkHistory = mutableMapOf<String, ArrayDeque<Float>>()
    private val jointLinearityHistory = mutableMapOf<String, ArrayDeque<Float>>()
    private val jointResidualHistory = mutableMapOf<String, ArrayDeque<Float>>()
    private val jointVariationHistory = mutableMapOf<String, ArrayDeque<Float>>()
    private val executionTimes = ArrayDeque<Float>()

    fun start() {
        if (worker?.isActive == true) return
        worker = scope.launch {
            val periodMs = (1000L / config.executionFrequencyHz.coerceAtLeast(1))
            for (first in input) {
                var latest = first
                while (true) latest = input.tryReceive().getOrNull() ?: break
                val started = System.nanoTime()
                if (!history.add(latest)) rejected++
                val frames = history.snapshot()
                val linearityResult = linearity.observe(frames)
                val smoothnessResult = smoothness.observe(frames)
                val stabilityResult = stability.observe(frames)
                val continuityResult = continuity.observe(frames)
                append(rateHistory, continuityResult.movementRateDegreesPerSecond)
                append(accelerationHistory, continuityResult.compositeAcceleration)
                append(jerkHistory, continuityResult.compositeJerk)
                OBSERVED_JOINTS.forEach { name ->
                    append(jointVelocityHistory.getOrPut(name) { ArrayDeque() }, smoothnessResult[name]?.currentVelocity)
                    append(jointAccelerationHistory.getOrPut(name) { ArrayDeque() }, smoothnessResult[name]?.currentAcceleration)
                    append(jointJerkHistory.getOrPut(name) { ArrayDeque() }, smoothnessResult[name]?.currentJerk)
                    append(jointLinearityHistory.getOrPut(name) { ArrayDeque() }, linearityResult[name]?.rSquared?.times(100f))
                    append(jointResidualHistory.getOrPut(name) { ArrayDeque() }, linearityResult[name]?.rmsResidualDegrees)
                    append(jointVariationHistory.getOrPut(name) { ArrayDeque() }, stabilityResult[name]?.standardDeviationDegrees)
                }
                val computationMs = (System.nanoTime() - started) / 1_000_000f
                executionTimes.addLast(computationMs); while (executionTimes.size > config.maxHistoryFrames) executionTimes.removeFirst()
                val sortedTimes = executionTimes.sorted()
                val performance = ObserverPerformance(executionTimes.size, executionTimes.average().toFloat(), percentile(sortedTimes, .95f), percentile(sortedTimes, .99f))
                val result = MovementObserverResult(latest.timestampNs, latest.anglesDegrees, latest.confidence, linearityResult, smoothnessResult, coordination.observe(frames), stabilityResult, continuityResult, reliability.observe(frames, rejected), frames.map { it.timestampNs }, OBSERVED_JOINTS.associateWith { name -> frames.mapNotNull { it.anglesDegrees[name] } }, rateHistory.toList(), accelerationHistory.toList(), jerkHistory.toList(), jointVelocityHistory.mapValues { it.value.toList() }, jointAccelerationHistory.mapValues { it.value.toList() }, jointJerkHistory.mapValues { it.value.toList() }, jointLinearityHistory.mapValues { it.value.toList() }, jointResidualHistory.mapValues { it.value.toList() }, jointVariationHistory.mapValues { it.value.toList() }, performance, computationMs.toLong(), history.size())
                _results.value = result
                if (recording) { recorded.addLast(result); while (recorded.size > config.maxHistoryFrames) recorded.removeFirst() }
                delay(periodMs)
            }
        }
    }
    fun submit(frame: MovementFrame) { if (!input.trySend(frame).isSuccess) rejected++ }
    fun reset() { history.clear(); rejected = 0; recorded.clear(); executionTimes.clear(); rateHistory.clear(); accelerationHistory.clear(); jerkHistory.clear(); listOf(jointVelocityHistory, jointAccelerationHistory, jointJerkHistory, jointLinearityHistory, jointResidualHistory, jointVariationHistory).forEach { it.clear() }; _results.value = MovementObserverResult() }
    fun resetTracking() = reset()
    fun startRecording() { recording = true; recorded.clear() }
    fun stopRecording(): String { recording = false; return exportCsv() }
    fun exportCsv(): String {
        val names = OBSERVED_JOINTS
        val rows = StringBuilder("timestampNs,bufferSize,computationTimeMs,validJointPercentage,movementRateDegreesPerSecond,").append(names.joinToString(",")).append('\n')
        recorded.forEach { result -> rows.append(result.timestampNs).append(',').append(result.bufferSize).append(',').append(result.computationTimeMs).append(',').append(result.continuity.validJointPercentage).append(',').append(result.continuity.movementRateDegreesPerSecond ?: "").append(',').append(names.joinToString(",") { result.frameAnglesDegrees[it]?.toString() ?: "" }).append('\n') }
        return rows.toString()
    }
    fun exportJson(): String {
        val rows = recorded.joinToString(",", prefix = "[", postfix = "]") { result ->
            "{\"timestampNs\":${result.timestampNs},\"anglesDegrees\":${result.frameAnglesDegrees.entries.joinToString(",", prefix = "{", postfix = "}") { "\"${it.key}\":${it.value}" }},\"confidence\":${result.frameConfidence.entries.joinToString(",", prefix = "{", postfix = "}") { "\"${it.key}\":${it.value}" }},\"bufferSize\":${result.bufferSize},\"computationTimeMs\":${result.computationTimeMs},\"movementRateDegreesPerSecond\":${result.continuity.movementRateDegreesPerSecond ?: "null"},\"validJointPercentage\":${result.continuity.validJointPercentage},\"trackingConfidence\":${result.tracking.meanLandmarkConfidence ?: "null"},\"observationDurationMs\":${result.tracking.observationDurationMs}}"
        }
        return rows
    }
    override fun close() { input.close(); worker?.cancel(); scope.cancel() }

    private fun append(history: ArrayDeque<Float>, value: Float?) {
        value?.takeIf { it.isFinite() }?.let { history.addLast(it); while (history.size > config.maxHistoryFrames) history.removeFirst() }
    }

    private fun percentile(sorted: List<Float>, fraction: Float): Float? = sorted.takeIf { it.isNotEmpty() }?.let { it[((it.size - 1) * fraction).roundToInt().coerceIn(0, it.lastIndex)] }
}

private fun series(frames: List<MovementFrame>, name: String, windowMs: Long): List<Pair<Long, Float>> { val cutoff = if (windowMs == Long.MAX_VALUE) Long.MIN_VALUE else frames.lastOrNull()?.timestampNs?.minus(windowMs * 1_000_000L) ?: Long.MIN_VALUE; return frames.mapNotNull { frame -> frame.anglesDegrees[name]?.takeIf { it.isFinite() && frame.timestampNs >= cutoff }?.let { frame.timestampNs to it } } }
private fun velocitySeries(frames: List<MovementFrame>, name: String): List<Pair<Long, Float>> = series(frames, name, Long.MAX_VALUE).zipWithNext().mapNotNull { derivative(it.first, it.second) }
private fun derivative(a: Pair<Long, Float>, b: Pair<Long, Float>): Pair<Long, Float>? { val dt = (b.first - a.first) / 1_000_000_000f; return if (dt > 1e-6f && dt.isFinite()) b.first to ((b.second - a.second) / dt) else null }
private fun rms(values: List<Float>): Float? = values.takeIf { it.isNotEmpty() }?.let { sqrt(it.map { v -> v * v }.average()).toFloat() }
private fun pearson(a: List<Float>, b: List<Float>): Float? { if (a.size < 2 || b.size != a.size) return null; val ma = a.average().toFloat(); val mb = b.average().toFloat(); val numerator = a.indices.sumOf { ((a[it] - ma) * (b[it] - mb)).toDouble() }.toFloat(); val da = sqrt(a.sumOf { ((it - ma) * (it - ma)).toDouble() }).toFloat(); val db = sqrt(b.sumOf { ((it - mb) * (it - mb)).toDouble() }).toFloat(); return if (da <= 1e-6f || db <= 1e-6f) null else (numerator / (da * db)).coerceIn(-1f, 1f) }
private fun aligned(a: List<Float>, b: List<Float>, lag: Int): Pair<List<Float>, List<Float>> { val left = mutableListOf<Float>(); val right = mutableListOf<Float>(); for (i in a.indices) { val j = i + lag; if (j in b.indices) { left += a[i]; right += b[j] } }; return left to right }
private fun medianStepMs(timestamps: List<Long>): Long { val values = timestamps.zipWithNext().map { (it.second - it.first) / 1_000_000L }.filter { it > 0 }.sorted(); return values.getOrNull(values.size / 2) ?: 33L }
private fun standardDeviation(values: List<Float>): Float { val mean = values.average(); return sqrt(values.map { (it - mean).pow(2) }.average()).toFloat() }
