package com.example.exerciseform.sdk.movementobserver

data class MovementObserverConfig(
    val historyDurationMs: Long = 5_000L,
    val localRegressionWindowMs: Long = 500L,
    val targetInputFrequencyHz: Int = 30,
    val executionFrequencyHz: Int = 10,
    val coordinationLagMs: Long = 500L,
    val minimumConfidence: Float = .55f,
    val maxHistoryFrames: Int = 240
)

data class MovementFrame(
    val timestampNs: Long,
    val anglesDegrees: Map<String, Float>,
    val confidence: Map<String, Float>,
    val validJoints: Set<String> = anglesDegrees.keys
) {
    val validJointCount: Int get() = anglesDegrees.keys.count { it in validJoints && anglesDegrees[it]?.isFinite() == true }
    companion object {
        fun from(timestampNs: Long, metrics: List<com.example.exerciseform.sdk.api.JointMetric>, minimumConfidence: Float = .55f): MovementFrame {
            val angles = metrics.filter { it.value.isFinite() && it.confidence >= minimumConfidence }
                .associate { it.name to it.value }
            return MovementFrame(timestampNs, angles, metrics.associate { it.name to it.confidence }, angles.keys)
        }
    }
}

class MovementHistoryBuffer(private val durationMs: Long = 5_000L, private val maxFrames: Int = 240) {
    private val frames = ArrayDeque<MovementFrame>()
    @Synchronized fun add(frame: MovementFrame): Boolean {
        if (frames.lastOrNull()?.timestampNs?.let { frame.timestampNs <= it } == true) return false
        frames.addLast(frame)
        val cutoff = frame.timestampNs - durationMs * 1_000_000L
        while (frames.size > maxFrames || (frames.size > 1 && frames.first().timestampNs < cutoff)) frames.removeFirst()
        return true
    }
    @Synchronized fun snapshot(): List<MovementFrame> = frames.toList()
    @Synchronized fun clear() = frames.clear()
    @Synchronized fun size(): Int = frames.size
}

data class LinearityMetric(val slopeDegreesPerSecond: Float? = null, val rSquared: Float? = null, val rmsResidualDegrees: Float? = null, val maxAbsoluteResidualDegrees: Float? = null)
data class SmoothnessMetric(val currentVelocity: Float? = null, val currentAcceleration: Float? = null, val currentJerk: Float? = null, val rmsVelocity: Float? = null, val rmsAcceleration: Float? = null, val rmsJerk: Float? = null, val peakAbsoluteJerk: Float? = null)
data class CoordinationMetric(val firstJoint: String, val secondJoint: String, val pearsonCorrelation: Float? = null, val maximumAbsoluteCorrelation: Float? = null, val signedCorrelationAtStrongestLag: Float? = null, val lagMs: Long? = null)
data class StabilityMetric(val meanDegrees: Float? = null, val standardDeviationDegrees: Float? = null, val varianceDegreesSquared: Float? = null, val minimumDegrees: Float? = null, val maximumDegrees: Float? = null, val rangeOfMotionDegrees: Float? = null, val medianAbsoluteDeviationDegrees: Float? = null)
data class ContinuityMetric(val displacementDegrees: Float? = null, val movementRateDegreesPerSecond: Float? = null, val compositeAcceleration: Float? = null, val compositeJerk: Float? = null, val rollingMeanRate: Float? = null, val rmsRate: Float? = null, val peakRate: Float? = null, val perJointContribution: Map<String, Float> = emptyMap(), val validJointPercentage: Float = 0f)
data class TrackingReliability(val meanLandmarkConfidence: Float? = null, val validJointCount: Int = 0, val validJointPercentage: Float = 0f, val missingJointPercentage: Float = 100f, val effectiveSamplingHz: Float? = null, val frameIntervalStdMs: Float? = null, val droppedOrInvalidObservations: Int = 0, val observationDurationMs: Long = 0L)
data class ObserverPerformance(val sampleCount: Int = 0, val meanMs: Float? = null, val p95Ms: Float? = null, val p99Ms: Float? = null)

data class MovementObserverResult(
    val timestampNs: Long = 0L,
    val frameAnglesDegrees: Map<String, Float> = emptyMap(),
    val frameConfidence: Map<String, Float> = emptyMap(),
    val linearity: Map<String, LinearityMetric> = emptyMap(),
    val smoothness: Map<String, SmoothnessMetric> = emptyMap(),
    val coordination: List<CoordinationMetric> = emptyList(),
    val stability: Map<String, StabilityMetric> = emptyMap(),
    val continuity: ContinuityMetric = ContinuityMetric(),
    val tracking: TrackingReliability = TrackingReliability(),
    val graphTimestampsNs: List<Long> = emptyList(),
    val graphAnglesDegrees: Map<String, List<Float>> = emptyMap(),
    val compositeMovementRateHistory: List<Float> = emptyList(),
    val compositeAccelerationHistory: List<Float> = emptyList(),
    val compositeJerkHistory: List<Float> = emptyList(),
    val jointVelocityHistory: Map<String, List<Float>> = emptyMap(),
    val jointAccelerationHistory: Map<String, List<Float>> = emptyMap(),
    val jointJerkHistory: Map<String, List<Float>> = emptyMap(),
    val jointLinearityHistory: Map<String, List<Float>> = emptyMap(),
    val jointResidualHistory: Map<String, List<Float>> = emptyMap(),
    val jointVariationHistory: Map<String, List<Float>> = emptyMap(),
    val performance: ObserverPerformance = ObserverPerformance(),
    val computationTimeMs: Long = 0L,
    val bufferSize: Int = 0
)
