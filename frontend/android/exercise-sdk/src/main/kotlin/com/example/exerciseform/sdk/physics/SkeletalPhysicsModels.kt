package com.example.exerciseform.sdk.physics

import com.example.exerciseform.sdk.api.PoseLandmark

data class PhysicsVector3(val x: Double, val y: Double, val z: Double) {
    operator fun plus(other: PhysicsVector3) = PhysicsVector3(x + other.x, y + other.y, z + other.z)
    operator fun minus(other: PhysicsVector3) = PhysicsVector3(x - other.x, y - other.y, z - other.z)
    operator fun times(scale: Double) = PhysicsVector3(x * scale, y * scale, z * scale)
    fun dot(other: PhysicsVector3) = x * other.x + y * other.y + z * other.z
    fun cross(other: PhysicsVector3) = PhysicsVector3(y * other.z - z * other.y, z * other.x - x * other.z, x * other.y - y * other.x)
    fun norm() = kotlin.math.sqrt(dot(this))
    fun normalized(): PhysicsVector3? = norm().takeIf { it > 1e-9 }?.let { this * (1.0 / it) }
}

enum class PhysicsLengthUnit { METERS, NORMALIZED_IMAGE_UNITS }
enum class PhysicsValidity { VALID, PARTIAL, UNAVAILABLE }

data class PhysicsMeasurement(val value: Double, val unit: String, val confidence: Float)
data class SupportPoint(val name: String, val position: PhysicsVector3, val confidence: Float)
data class SupportPolygon(val points: List<PhysicsVector3>, val planeNormal: PhysicsVector3, val confidence: Float)
data class SegmentOrientation(
    val direction: PhysicsVector3,
    val inclinationFromGravityDegrees: Double?,
    val relativeToParentDegrees: Double?,
    val confidence: Float
)
data class KinematicMeasurement(
    val velocity: PhysicsVector3?,
    val acceleration: PhysicsVector3?,
    val jerk: PhysicsVector3?,
    val confidence: Float
)
data class AngularKinematicMeasurement(
    val angularVelocityRadPerSecond: PhysicsVector3?,
    val angularAccelerationRadPerSecondSquared: PhysicsVector3?,
    val confidence: Float
)

data class SkeletalPhysicsResult(
    val timestampNs: Long = 0L,
    val coordinateUnit: PhysicsLengthUnit = PhysicsLengthUnit.NORMALIZED_IMAGE_UNITS,
    val centerOfMass: PhysicsVector3? = null,
    val gravityDirection: PhysicsVector3 = PhysicsVector3(0.0, -1.0, 0.0),
    val supportPoints: List<SupportPoint> = emptyList(),
    val supportPolygon: SupportPolygon? = null,
    val stabilityMargin: PhysicsMeasurement? = null,
    val jointMomentArms: Map<String, PhysicsMeasurement> = emptyMap(),
    val normalizedGravitationalTorquesNmPerKg: Map<String, PhysicsVector3> = emptyMap(),
    val segmentOrientations: Map<String, SegmentOrientation> = emptyMap(),
    val linearDynamics: Map<String, KinematicMeasurement> = emptyMap(),
    val angularDynamics: Map<String, AngularKinematicMeasurement> = emptyMap(),
    val segmentMassFractions: Map<String, Double> = emptyMap(),
    val validity: PhysicsValidity = PhysicsValidity.UNAVAILABLE,
    val trackingConfidence: Float = 0f,
    val unavailableMeasurements: Map<String, String> = emptyMap(),
    val computationTimeMs: Long = 0L
    ,val imageLandmarkCount: Int = 0,
    val worldLandmarkCount: Int = 0
)

data class SkeletalPhysicsConfig(
    val processingHz: Int = 10,
    val minLandmarkConfidence: Float = .55f,
    val gravityDirection: PhysicsVector3 = PhysicsVector3(0.0, -1.0, 0.0),
    val supportPlaneNormal: PhysicsVector3? = null,
    val assumedContactPointNames: Set<String> = emptySet()
)

internal data class SegmentDefinition(
    val name: String,
    val proximal: Int,
    val distal: Int,
    val massFraction: Double,
    val centerOfMassFromProximal: Double,
    val parent: String? = null
)

internal data class PhysicsSnapshot(val timestampNs: Long, val landmarks: List<PoseLandmark>, val imageLandmarkCount: Int = landmarks.size, val worldLandmarkCount: Int = 0)
