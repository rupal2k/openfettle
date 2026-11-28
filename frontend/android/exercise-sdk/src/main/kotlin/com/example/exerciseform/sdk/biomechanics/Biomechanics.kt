package com.example.exerciseform.sdk.biomechanics

import com.example.exerciseform.sdk.api.*
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.sqrt

object LandmarkIndex {
    const val NOSE = 0
    const val LEFT_SHOULDER = 11; const val RIGHT_SHOULDER = 12
    const val LEFT_ELBOW = 13; const val RIGHT_ELBOW = 14
    const val LEFT_WRIST = 15; const val RIGHT_WRIST = 16
    const val LEFT_HIP = 23; const val RIGHT_HIP = 24
    const val LEFT_KNEE = 25; const val RIGHT_KNEE = 26
    const val LEFT_ANKLE = 27; const val RIGHT_ANKLE = 28
    const val LEFT_HEEL = 29; const val RIGHT_HEEL = 30
    const val LEFT_FOOT_INDEX = 31; const val RIGHT_FOOT_INDEX = 32
}

data class JointAngleSpec(val id: String, val a: Int, val vertex: Int, val c: Int)
data class SegmentSpec(val id: String, val from: Int, val to: Int)
data class MetricValue(val value: Float, val confidence: Float)
data class FeatureSnapshot(
    val timestampNs: Long,
    val angles: Map<String, MetricValue>,
    val orientations: Map<String, MetricValue>,
    val normalizedPositions: Map<String, MetricValue>,
    val velocities: Map<String, MetricValue>,
    val symmetry: Map<String, MetricValue>,
    val stability: Map<String, MetricValue>,
    val confidence: Float
) { fun metric(id: String): MetricValue? = angles[id] ?: orientations[id] ?: normalizedPositions[id] ?: velocities[id] ?: symmetry[id] ?: stability[id] }

object JointAngleCalculator {
    fun calculate(frame: PoseFrame, specs: List<JointAngleSpec>, minConfidence: Float): Map<String, MetricValue> {
        val points = frame.landmarks.associateBy { it.index }
        return specs.mapNotNull { spec ->
            val a = points[spec.a]?.takeIf { it.confidence >= minConfidence }; val b = points[spec.vertex]?.takeIf { it.confidence >= minConfidence }; val c = points[spec.c]?.takeIf { it.confidence >= minConfidence }
            if (a == null || b == null || c == null) null else spec.id to MetricValue(Geometry.angle(Geometry.point(a), Geometry.point(b), Geometry.point(c)), minOf(a.confidence, b.confidence, c.confidence))
        }.toMap()
    }
}

object SegmentOrientationCalculator {
    fun calculate(frame: PoseFrame, specs: List<SegmentSpec>, minConfidence: Float): Map<String, MetricValue> {
        val points = frame.landmarks.associateBy { it.index }
        return specs.mapNotNull { spec ->
            val a = points[spec.from]?.takeIf { it.confidence >= minConfidence }; val b = points[spec.to]?.takeIf { it.confidence >= minConfidence }
            if (a == null || b == null) null else spec.id to MetricValue(Math.toDegrees(atan2((b.y - a.y).toDouble(), (b.x - a.x).toDouble())).toFloat(), minOf(a.confidence, b.confidence))
        }.toMap()
    }
}

object RangeOfMotionAnalyzer { fun range(history: Iterable<FeatureSnapshot>, metric: String): MetricValue? { val values = history.mapNotNull { it.metric(metric) }; if (values.isEmpty()) return null; return MetricValue(values.maxOf { it.value } - values.minOf { it.value }, values.minOf { it.confidence }) } }

object JointVelocityAnalyzer {
    fun calculate(current: PoseFrame, previous: PoseFrame?, dtSeconds: Float, ids: List<Int>, minConfidence: Float): Map<String, MetricValue> {
        if (previous == null || dtSeconds <= 0f) return emptyMap(); val old = previous.landmarks.associateBy { it.index }; val now = current.landmarks.associateBy { it.index }
        return ids.mapNotNull { id -> val a = now[id]?.takeIf { it.confidence >= minConfidence }; val b = old[id]?.takeIf { it.confidence >= minConfidence }; if (a == null || b == null) null else "landmark.$id.velocity" to MetricValue(Geometry.distance(a, b) / dtSeconds, minOf(a.confidence, b.confidence)) }.toMap()
    }
}

object SymmetryAnalyzer { fun compare(left: MetricValue?, right: MetricValue?): MetricValue? = if (left == null || right == null) null else MetricValue(abs(left.value - right.value), minOf(left.confidence, right.confidence)) }
object StabilityAnalyzer { fun score(history: Iterable<FeatureSnapshot>, metric: String): MetricValue? { val values = history.mapNotNull { it.metric(metric) }; if (values.size < 2) return null; val mean = values.map { it.value }.average().toFloat(); return MetricValue(sqrt(values.map { (it.value - mean) * (it.value - mean) }.average()).toFloat(), values.minOf { it.confidence }) } }

class BiomechanicsEngine(private val minConfidence: Float) {
    fun extract(frame: PoseFrame, previous: PoseFrame?, dt: Float): Pair<List<JointMetric>, FeatureSnapshot> {
        val angles = JointAngleCalculator.calculate(frame, DEFAULT_ANGLES, minConfidence); val orientations = SegmentOrientationCalculator.calculate(frame, DEFAULT_SEGMENTS, minConfidence); val velocities = JointVelocityAnalyzer.calculate(frame, previous, dt, VELOCITY_LANDMARKS, minConfidence); val m = frame.landmarks.associateBy { it.index }; val torso = Geometry.distanceOrNull(m[LandmarkIndex.LEFT_SHOULDER], m[LandmarkIndex.LEFT_HIP], minConfidence)
        val positions = listOfNotNull(normalizedY("left.ankle.y", m[LandmarkIndex.LEFT_ANKLE], m[LandmarkIndex.LEFT_HIP], torso, minConfidence), normalizedY("right.ankle.y", m[LandmarkIndex.RIGHT_ANKLE], m[LandmarkIndex.RIGHT_HIP], torso, minConfidence), normalizedY("left.wrist.y", m[LandmarkIndex.LEFT_WRIST], m[LandmarkIndex.LEFT_SHOULDER], torso, minConfidence), normalizedY("right.wrist.y", m[LandmarkIndex.RIGHT_WRIST], m[LandmarkIndex.RIGHT_SHOULDER], torso, minConfidence)).toMap()
        val symmetry = listOfNotNull(SymmetryAnalyzer.compare(angles["left.knee"], angles["right.knee"])?.let { "knee" to it }, SymmetryAnalyzer.compare(angles["left.elbow"], angles["right.elbow"])?.let { "elbow" to it }, SymmetryAnalyzer.compare(angles["left.shoulder"], angles["right.shoulder"])?.let { "shoulder" to it }).toMap()
        val all = angles.values + orientations.values + positions.values; val confidence = if (all.isEmpty()) 0f else all.map { it.confidence }.average().toFloat(); val snapshot = FeatureSnapshot(frame.timestampNs, angles, orientations, positions, velocities, symmetry, emptyMap(), confidence); val metrics = angles.map { JointMetric(it.key, it.value.value, it.value.confidence) } + orientations.map { JointMetric(it.key, it.value.value, it.value.confidence) }; return metrics to snapshot
    }
    private fun normalizedY(id: String, point: PoseLandmark?, anchor: PoseLandmark?, scale: Float?, min: Float): Pair<String, MetricValue>? = if (point == null || anchor == null || scale == null || scale < 1e-4f || point.confidence < min || anchor.confidence < min) null else id to MetricValue((point.y - anchor.y) / scale, minOf(point.confidence, anchor.confidence))
    companion object {
        val DEFAULT_ANGLES = listOf(JointAngleSpec("left.knee", 23, 25, 27), JointAngleSpec("right.knee", 24, 26, 28), JointAngleSpec("left.elbow", 11, 13, 15), JointAngleSpec("right.elbow", 12, 14, 16), JointAngleSpec("left.shoulder", 13, 11, 23), JointAngleSpec("right.shoulder", 14, 12, 24), JointAngleSpec("left.hip", 11, 23, 25), JointAngleSpec("right.hip", 12, 24, 26), JointAngleSpec("left.ankle", 25, 27, 31), JointAngleSpec("right.ankle", 26, 28, 32))
        val DEFAULT_SEGMENTS = listOf(SegmentSpec("torso", 23, 11), SegmentSpec("left.thigh", 23, 25), SegmentSpec("right.thigh", 24, 26), SegmentSpec("left.shin", 25, 27), SegmentSpec("right.shin", 26, 28))
        val VELOCITY_LANDMARKS = listOf(15, 16, 23, 24, 25, 26, 27, 28)
    }
}

private fun Geometry.distanceOrNull(a: PoseLandmark?, b: PoseLandmark?, min: Float): Float? = if (a == null || b == null || a.confidence < min || b.confidence < min) null else distance(a, b)
