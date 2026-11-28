package com.example.exerciseform.sdk.movementscoring

import kotlin.math.*

data class MovementScoringConfig(
    val executionFrequencyHz: Int = 5,
    val windowsMs: List<Long> = listOf(100L, 500L, 2_000L, 5_000L, 15_000L, 30_000L),
    val historySize: Int = 300,
    val minimumSamples: Int = 3,
    val minimumDimensionsForComposite: Int = 2,
    val residualScaleDegrees: Float = 10f,
    val jerkScaleDegreesPerSecond3: Float = 2_000f,
    val correlationVariationScale: Float = .5f,
    val stabilityVariationScaleDegrees: Float = 15f
)

enum class ScoreValidity { VALID, INSUFFICIENT_DATA, NOT_APPLICABLE, INVALID_INPUT }

data class ScoreEvidence(
    val scoreName: String,
    val value: Float?,
    val rawMeasurements: Map<String, Float?>,
    val normalizationMethod: String,
    val observationWindowMs: Long?,
    val contributingJoints: List<String>,
    val observationDurationMs: Long,
    val dataCoveragePercent: Float,
    val validity: ScoreValidity,
    val reason: String,
    val weight: Float = 1f
)

data class DimensionScore(val name: String, val score: Float?, val evidence: ScoreEvidence)

data class TemporalEvidence(
    val durationMs: Long,
    val irregularityFrequency: Float,
    val changeMagnitude: Float,
    val persistenceMs: Long,
    val recurrenceCount: Int,
    val recoveryDurationMs: Long?,
    val coveragePercent: Float
)

data class TimescaleScore(
    val windowMs: Long,
    val dimensions: List<DimensionScore>,
    val compositeScore: Float?,
    val effectiveWeights: Map<String, Float>,
    val evidence: TemporalEvidence
)

data class MovementScoreTrend(
    val currentScore: Float?, val rollingMean: Float?, val minimum: Float?, val maximum: Float?,
    val variance: Float?, val rateOfChangePerSecond: Float?, val sustainedChangeMs: Long,
    val sessionDistribution: List<Float>
)

data class MovementScoringResult(
    val timestampNs: Long = 0L,
    val immediateBehaviourScore: Float? = null,
    val temporalBehaviourScore: Float? = null,
    val sessionBehaviourScore: Float? = null,
    val dimensions: List<DimensionScore> = emptyList(),
    val timescales: Map<Long, TimescaleScore> = emptyMap(),
    val trend: MovementScoreTrend = MovementScoreTrend(null, null, null, null, null, null, 0L, emptyList()),
    val trackingReliability: Float? = null,
    val effectiveWeights: Map<String, Float> = emptyMap(),
    val temporalEvidence: TemporalEvidence? = null,
    val computationTimeMs: Long = 0L,
    val sessionDurationMs: Long = 0L
)

class MovementMetricNormalizer(private val config: MovementScoringConfig) {
    /** Linear bounded normalization: 100 * (1 - min(1, error / scale)). */
    fun residualScore(errorDegrees: Float?): Float? = boundedInverse(errorDegrees, config.residualScaleDegrees)
    /** Linear bounded normalization of jerk magnitude in degrees/s^3. */
    fun jerkScore(jerk: Float?): Float? = boundedInverse(jerk, config.jerkScaleDegreesPerSecond3)
    /** Consistency is temporal variation, not correlation magnitude. */
    fun correlationConsistency(stdDev: Float?): Float? = boundedInverse(stdDev, config.correlationVariationScale)
    /** Angular steadiness is only meaningful during a stationary observation. */
    fun stabilityScore(stdDevDegrees: Float?): Float? = boundedInverse(stdDevDegrees, config.stabilityVariationScaleDegrees)
    fun boundedInverse(value: Float?, scale: Float): Float? {
        if (value == null || !value.isFinite() || !scale.isFinite() || scale <= 0f) return null
        return (100f * (1f - (value.absoluteValue / scale).coerceIn(0f, 1f))).coerceIn(0f, 100f)
    }
}

class TemporalEvidenceAccumulator(private val maxEvents: Int = 300) {
    private data class Event(val timestampNs: Long, val magnitude: Float, val changed: Boolean, val recovered: Boolean)
    private val events = ArrayDeque<Event>()
    @Synchronized fun add(timestampNs: Long, magnitude: Float, changed: Boolean, recovered: Boolean) {
        if (!magnitude.isFinite()) return
        events.addLast(Event(timestampNs, magnitude, changed, recovered))
        while (events.size > maxEvents) events.removeFirst()
    }
    @Synchronized fun snapshot(nowNs: Long): TemporalEvidence {
        val e = events.toList(); if (e.isEmpty()) return TemporalEvidence(0, 0f, 0f, 0, 0, null, 0f)
        val duration = ((nowNs - e.first().timestampNs) / 1_000_000L).coerceAtLeast(0L)
        val changed = e.count { it.changed }; val recovered = e.count { it.recovered }
        return TemporalEvidence(duration, changed.toFloat() / e.size, e.map { it.magnitude }.average().toFloat(),
            if (changed == 0) 0L else duration, changed, if (recovered == 0) null else duration / recovered, 100f)
    }
    @Synchronized fun clear() = events.clear()
}

class CompositeScoreAggregator(private val minimumDimensions: Int) {
    fun aggregate(dimensions: List<DimensionScore>): Pair<Float?, Map<String, Float>> {
        val valid = dimensions.filter { it.score != null && it.evidence.validity == ScoreValidity.VALID }
        if (valid.size < minimumDimensions) return null to emptyMap()
        val weights = valid.associate { it.name to it.evidence.weight }
        val total = weights.values.sum().takeIf { it > 0f } ?: return null to emptyMap()
        return valid.sumOf { (it.score!! * weights.getValue(it.name)).toDouble() }.toFloat() / total to weights
    }
}

class MovementScoreTrendAnalyzer(private val maxSamples: Int = 300) {
    private data class Sample(val t: Long, val score: Float)
    private val samples = ArrayDeque<Sample>()
    @Synchronized fun add(t: Long, score: Float?) {
        if (score == null || !score.isFinite()) return
        samples.addLast(Sample(t, score)); while (samples.size > maxSamples) samples.removeFirst()
    }
    @Synchronized fun result(): MovementScoreTrend {
        val s = samples.toList(); if (s.isEmpty()) return MovementScoreTrend(null, null, null, null, null, null, 0L, emptyList())
        val values = s.map { it.score }; val mean = values.average().toFloat(); val variance = values.map { (it - mean).pow(2) }.average().toFloat()
        val rate = if (s.size < 2) null else ((s.last().score - s.first().score) / ((s.last().t - s.first().t).coerceAtLeast(1L) / 1_000_000_000f))
        return MovementScoreTrend(s.last().score, mean, values.minOrNull(), values.maxOrNull(), variance, rate, if (variance > 1f) ((s.last().t - s.first().t) / 1_000_000L) else 0L, values)
    }
    @Synchronized fun clear() = samples.clear()
}
