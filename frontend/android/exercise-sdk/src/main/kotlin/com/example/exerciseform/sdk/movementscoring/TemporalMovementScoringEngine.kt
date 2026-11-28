package com.example.exerciseform.sdk.movementscoring

import com.example.exerciseform.sdk.movementobserver.*
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.*
import kotlin.math.*

private fun evidence(name: String, score: Float?, raw: Map<String, Float?>, method: String, window: Long?, joints: List<String>, duration: Long, coverage: Float, validity: ScoreValidity, reason: String) =
    DimensionScore(name, score, ScoreEvidence(name, score, raw, method, window, joints, duration, coverage, validity, reason))

private interface DimensionScorer { fun score(r: MovementObserverResult, window: Long): DimensionScore }

class MovementContinuityScorer(private val normalizer: MovementMetricNormalizer) : DimensionScorer {
    override fun score(r: MovementObserverResult, window: Long): DimensionScore {
        val metric = r.continuity; val residual = r.linearity.values.mapNotNull { it.rmsResidualDegrees }.average().toFloat()
        val coverage = r.tracking.validJointPercentage
        if (!residual.isFinite() || r.bufferSize < 2) return evidence("Movement continuity", null, mapOf("rmsResidualDegrees" to residual), "Unavailable until regression evidence exists", window, r.frameAnglesDegrees.keys.toList(), r.tracking.observationDurationMs, coverage, ScoreValidity.INSUFFICIENT_DATA, "Insufficient temporal samples")
        return evidence("Movement continuity", normalizer.residualScore(residual), mapOf("rmsResidualDegrees" to residual, "movementRateDegreesPerSecond" to metric.movementRateDegreesPerSecond, "validJointPercentage" to coverage), "100 * (1 - min(1, RMS residual / residualScaleDegrees)); direction changes are retained as observations", window, r.frameAnglesDegrees.keys.toList(), r.tracking.observationDurationMs, coverage, ScoreValidity.VALID, "Observable trajectory continuity only")
    }
}

class MovementSmoothnessScorer(private val normalizer: MovementMetricNormalizer) : DimensionScorer {
    override fun score(r: MovementObserverResult, window: Long): DimensionScore {
        val jerks = r.smoothness.values.mapNotNull { it.rmsJerk }.filter { it.isFinite() }
        if (jerks.isEmpty()) return evidence("Movement smoothness", null, emptyMap(), "Unavailable without jerk evidence", window, emptyList(), r.tracking.observationDurationMs, r.tracking.validJointPercentage, ScoreValidity.INSUFFICIENT_DATA, "No valid jerk measurements")
        val jerk = jerks.average().toFloat()
        return evidence("Movement smoothness", normalizer.jerkScore(jerk), mapOf("rmsJerkDegreesPerSecond3" to jerk, "rmsVelocityDegreesPerSecond" to r.smoothness.values.mapNotNull { it.rmsVelocity }.average().toFloat()), "100 * (1 - min(1, RMS jerk / jerkScale)); amplitude and duration remain in raw evidence", window, r.smoothness.keys.toList(), r.tracking.observationDurationMs, r.tracking.validJointPercentage, ScoreValidity.VALID, "Experimental smoothness normalization")
    }
}

class JointCoordinationScorer(private val normalizer: MovementMetricNormalizer) : DimensionScorer {
    override fun score(r: MovementObserverResult, window: Long): DimensionScore {
        val correlations = r.coordination.mapNotNull { it.signedCorrelationAtStrongestLag }.filter { it.isFinite() }
        if (correlations.size < 2) return evidence("Joint coordination consistency", null, emptyMap(), "Unavailable until multiple comparable joint relationships exist", window, emptyList(), r.tracking.observationDurationMs, r.tracking.validJointPercentage, ScoreValidity.INSUFFICIENT_DATA, "Insufficient comparable coordination evidence")
        val mean = correlations.average().toFloat(); val sd = sqrt(correlations.map { (it - mean).pow(2) }.average()).toFloat()
        return evidence("Joint coordination consistency", normalizer.correlationConsistency(sd), mapOf("meanSignedCorrelation" to mean, "correlationStdDev" to sd, "maximumAbsoluteCorrelation" to r.coordination.mapNotNull { it.maximumAbsoluteCorrelation }.average().toFloat()), "100 * (1 - min(1, temporal/relationship correlation variation / variationScale)); correlation magnitude is not rewarded", window, r.coordination.flatMap { listOf(it.firstJoint, it.secondJoint) }.distinct(), r.tracking.observationDurationMs, r.tracking.validJointPercentage, ScoreValidity.VALID, "Consistency of observed relationships, not a correctness judgment")
    }
}

class AngularStabilityScorer(private val normalizer: MovementMetricNormalizer) : DimensionScorer {
    override fun score(r: MovementObserverResult, window: Long): DimensionScore {
        val rate = r.continuity.movementRateDegreesPerSecond ?: return evidence("Angular stability", null, emptyMap(), "Not applicable without movement-rate evidence", window, emptyList(), r.tracking.observationDurationMs, r.tracking.validJointPercentage, ScoreValidity.NOT_APPLICABLE, "Stationary applicability cannot be established")
        val deviations = r.stability.values.mapNotNull { it.standardDeviationDegrees }.filter { it.isFinite() }
        if (rate > 1f || deviations.isEmpty()) return evidence("Angular stability", null, mapOf("movementRateDegreesPerSecond" to rate), "Applicable only during a computationally stationary interval", window, r.stability.keys.toList(), r.tracking.observationDurationMs, r.tracking.validJointPercentage, ScoreValidity.NOT_APPLICABLE, "Active movement or insufficient variation evidence")
        val sd = deviations.average().toFloat()
        return evidence("Angular stability", normalizer.stabilityScore(sd), mapOf("meanStandardDeviationDegrees" to sd, "movementRateDegreesPerSecond" to rate), "100 * (1 - min(1, angular SD / stabilityScale)); this is steadiness, not balance", window, r.stability.keys.toList(), r.tracking.observationDurationMs, r.tracking.validJointPercentage, ScoreValidity.VALID, "Stationary angular variation")
    }
}

class TemporalConsistencyScorer(private val normalizer: MovementMetricNormalizer) : DimensionScorer {
    override fun score(r: MovementObserverResult, window: Long): DimensionScore {
        val rates = r.compositeMovementRateHistory.filter { it.isFinite() }
        if (rates.size < 3) return evidence("Temporal consistency", null, emptyMap(), "Unavailable without a movement-rate history", window, emptyList(), r.tracking.observationDurationMs, r.tracking.validJointPercentage, ScoreValidity.INSUFFICIENT_DATA, "Insufficient history")
        val mean = rates.average().toFloat(); val cv = if (mean.absoluteValue < 1e-5f) 0f else sqrt(rates.map { (it - mean).pow(2) }.average()).toFloat() / mean.absoluteValue
        return evidence("Temporal consistency", normalizer.boundedInverse(cv, 1f), mapOf("movementRateMean" to mean, "movementRateCoefficientOfVariation" to cv), "100 * (1 - min(1, coefficient of variation / 1)); descriptive recurrence consistency, not correctness", window, emptyList(), r.tracking.observationDurationMs, r.tracking.validJointPercentage, ScoreValidity.VALID, "Variation of observed progression")
    }
}

class RecoveryBehaviourScorer(private val normalizer: MovementMetricNormalizer) : DimensionScorer {
    override fun score(r: MovementObserverResult, window: Long): DimensionScore {
        val rates = r.compositeMovementRateHistory.filter { it.isFinite() }
        if (rates.size < 5) return evidence("Recovery behaviour", null, emptyMap(), "Unavailable unless a settling event is observable", window, emptyList(), r.tracking.observationDurationMs, r.tracking.validJointPercentage, ScoreValidity.NOT_APPLICABLE, "No observable transition and settling history")
        val peak = rates.maxOrNull() ?: return evidence("Recovery behaviour", null, emptyMap(), "Unavailable", window, emptyList(), 0, 0f, ScoreValidity.NOT_APPLICABLE, "No peak")
        val tail = rates.takeLast(max(2, rates.size / 4)); val tailMean = tail.average().toFloat()
        if (peak <= 0f || tailMean >= peak * .8f) return evidence("Recovery behaviour", null, mapOf("peakRate" to peak, "tailMeanRate" to tailMean), "Requires an observable peak followed by settling", window, emptyList(), r.tracking.observationDurationMs, r.tracking.validJointPercentage, ScoreValidity.NOT_APPLICABLE, "No settling event")
        return evidence("Recovery behaviour", normalizer.boundedInverse(tailMean / peak, 1f), mapOf("peakRate" to peak, "tailMeanRate" to tailMean), "100 * (1 - min(1, settling-rate / peak-rate)); no return-to-posture assumption", window, emptyList(), r.tracking.observationDurationMs, r.tracking.validJointPercentage, ScoreValidity.VALID, "Observable reduction after a movement peak")
    }
}

class TemporalMovementScoringEngine(private val config: MovementScoringConfig = MovementScoringConfig()) : java.io.Closeable {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val input = Channel<MovementObserverResult>(Channel.CONFLATED)
    private val normalizer = MovementMetricNormalizer(config)
    private val accumulator = TemporalEvidenceAccumulator(config.historySize)
    private val trend = MovementScoreTrendAnalyzer(config.historySize)
    private val aggregator = CompositeScoreAggregator(config.minimumDimensionsForComposite)
    private val _results = MutableStateFlow(MovementScoringResult())
    val results: StateFlow<MovementScoringResult> = _results.asStateFlow()
    private val recorded = ArrayDeque<MovementScoringResult>()
    @Volatile private var recording = false
    private var worker: Job? = null
    private val scorers = listOf(MovementContinuityScorer(normalizer), MovementSmoothnessScorer(normalizer), JointCoordinationScorer(normalizer), AngularStabilityScorer(normalizer), TemporalConsistencyScorer(normalizer), RecoveryBehaviourScorer(normalizer))

    private fun enforceWindowValidity(dimension: DimensionScore, result: MovementObserverResult, window: Long): DimensionScore {
        val enoughDuration = result.tracking.observationDurationMs >= window
        val enoughSamples = result.bufferSize >= config.minimumSamples
        if (enoughDuration && enoughSamples) return dimension
        return dimension.copy(score = null, evidence = dimension.evidence.copy(
            value = null,
            observationWindowMs = window,
            validity = ScoreValidity.INSUFFICIENT_DATA,
            reason = "Window requires ${window} ms and ${config.minimumSamples} samples; available ${result.tracking.observationDurationMs} ms/${result.bufferSize} samples"
        ))
    }

    fun start() { if (worker?.isActive == true) return; worker = scope.launch { for (r in input) { if (r.timestampNs != 0L) publish(r); delay(1_000L / config.executionFrequencyHz.coerceAtLeast(1)) } } }
    fun submit(result: MovementObserverResult) { input.trySend(result) }
    private fun publish(r: MovementObserverResult) {
        val started = System.nanoTime(); val all = config.windowsMs.distinct().associateWith { window ->
            val dims = scorers.map { enforceWindowValidity(it.score(r, window), r, window) }; val (composite, weights) = aggregator.aggregate(dims)
            TimescaleScore(window, dims, composite, weights, accumulator.snapshot(r.timestampNs))
        }
        val current = all[config.windowsMs.firstOrNull() ?: 100L]?.compositeScore
        val medium = all.entries.firstOrNull { it.key >= 2_000L }?.value?.compositeScore
        val session = all.maxByOrNull { it.key }?.value?.compositeScore
        val dimensions = all[config.windowsMs.firstOrNull() ?: 100L]?.dimensions.orEmpty()
        val rate = r.continuity.movementRateDegreesPerSecond
        val peak = r.continuity.peakRate
        val meanRate = r.continuity.rollingMeanRate
        accumulator.add(r.timestampNs, rate ?: 0f, rate != null && peak != null && meanRate != null && peak > meanRate * 1.5f, false)
        trend.add(r.timestampNs, medium ?: current)
        val ev = accumulator.snapshot(r.timestampNs)
        val output = MovementScoringResult(r.timestampNs, current, medium, session, dimensions, all, trend.result(), r.tracking.meanLandmarkConfidence, all.values.flatMap { it.effectiveWeights.entries }.groupBy { it.key }.mapValues { it.value.map { x -> x.value }.average().toFloat() }, ev, (System.nanoTime() - started) / 1_000_000L, r.tracking.observationDurationMs)
        if (recording) synchronized(recorded) { recorded.addLast(output); while (recorded.size > config.historySize) recorded.removeFirst() }
        _results.value = output
    }
    fun reset() { accumulator.clear(); trend.clear(); _results.value = MovementScoringResult() }
    fun startRecording() { synchronized(recorded) { recorded.clear() }; recording = true }
    fun stopRecording(): String { recording = false; return synchronized(recorded) { recorded.joinToString("\n") { "${it.timestampNs},${it.immediateBehaviourScore ?: ""},${it.temporalBehaviourScore ?: ""},${it.sessionBehaviourScore ?: ""},${it.sessionDurationMs}" } } }
    fun exportJson(): String = synchronized(recorded) { recorded.joinToString(prefix = "[", postfix = "]", separator = ",") { "{\"timestampNs\":${it.timestampNs},\"immediate\":${it.immediateBehaviourScore ?: "null"},\"temporal\":${it.temporalBehaviourScore ?: "null"},\"session\":${it.sessionBehaviourScore ?: "null"},\"durationMs\":${it.sessionDurationMs}}" } }
    override fun close() { input.close(); scope.cancel() }
}
