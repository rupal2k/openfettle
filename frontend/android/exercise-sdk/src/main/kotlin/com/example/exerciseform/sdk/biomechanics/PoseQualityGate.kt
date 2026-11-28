package com.example.exerciseform.sdk.biomechanics

import android.content.Context
import com.example.exerciseform.sdk.api.PoseFrame
import org.json.JSONObject
import kotlin.math.abs

data class JointAngleLimit(val id: String, val a: Int, val vertex: Int, val c: Int, val minDegrees: Float, val maxDegrees: Float)

data class PoseQualityGateConfig(
    val enabled: Boolean,
    val minimumCheckedAngles: Int,
    val maxOutOfRangeAngles: Int,
    val maxAngleJumps: Int,
    val maxFrameAngleDeltaDegrees: Float,
    val angles: List<JointAngleLimit>
)

/** Rejects implausible landmark frames before smoothing and scoring. */
class PoseQualityGate(private val config: PoseQualityGateConfig) {
    private var previousAngles: Map<String, Float> = emptyMap()

    @Synchronized
    fun accepts(frame: PoseFrame, minConfidence: Float): Boolean {
        if (!config.enabled || config.angles.isEmpty()) return true
        val points = frame.landmarks.associateBy { it.index }
        val measured = config.angles.mapNotNull { limit ->
            val a = points[limit.a]?.takeIf { it.confidence >= minConfidence }
            val b = points[limit.vertex]?.takeIf { it.confidence >= minConfidence }
            val c = points[limit.c]?.takeIf { it.confidence >= minConfidence }
            if (a == null || b == null || c == null) null
            else limit to Geometry.angle(Geometry.point(a), Geometry.point(b), Geometry.point(c))
        }
        if (measured.size < config.minimumCheckedAngles) return true
        val outOfRange = measured.count { (limit, value) -> !value.isFinite() || value < limit.minDegrees || value > limit.maxDegrees }
        if (outOfRange > config.maxOutOfRangeAngles) return false
        val jump = config.maxFrameAngleDeltaDegrees
        val angleJumps = if (jump > 0f && previousAngles.isNotEmpty()) {
            measured.count { (limit, value) -> previousAngles[limit.id]?.let { abs(value - it) > jump } == true }
        } else 0
        if (angleJumps > config.maxAngleJumps) return false
        previousAngles = measured.associate { it.first.id to it.second }
        return true
    }

    @Synchronized fun reset() { previousAngles = emptyMap() }

    companion object {
        fun fromAssets(context: Context, assetPath: String): PoseQualityGate {
            val root = context.assets.open(assetPath).bufferedReader().use { JSONObject(it.readText()) }
            val schema = root.optString("schemaVersion")
            require(schema == "1.0") { "Unsupported pose quality gate schemaVersion: $schema" }
            val array = root.optJSONArray("angles") ?: error("Pose quality gate is missing angles")
            val angles = (0 until array.length()).map { index ->
                val item = array.getJSONObject(index)
                JointAngleLimit(item.getString("id"), item.getInt("a"), item.getInt("vertex"), item.getInt("c"), item.getDouble("minDegrees").toFloat(), item.getDouble("maxDegrees").toFloat()).also {
                    require(it.minDegrees < it.maxDegrees) { "Invalid limits for ${it.id}" }
                }
            }
            return PoseQualityGate(PoseQualityGateConfig(root.optBoolean("enabled", true), root.optInt("minimumCheckedAngles", 2).coerceAtLeast(1), root.optInt("maxOutOfRangeAngles", 2).coerceAtLeast(0), root.optInt("maxAngleJumps", 1).coerceAtLeast(0), root.optDouble("maxFrameAngleDeltaDegrees", 120.0).toFloat(), angles))
        }
    }
}
