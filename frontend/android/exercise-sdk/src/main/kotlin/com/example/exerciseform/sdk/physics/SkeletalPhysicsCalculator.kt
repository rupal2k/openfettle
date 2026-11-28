package com.example.exerciseform.sdk.physics

import com.example.exerciseform.sdk.api.PoseLandmark
import com.example.exerciseform.sdk.biomechanics.LandmarkIndex
import kotlin.math.acos
import kotlin.math.atan2
import kotlin.math.max
import kotlin.math.min

internal object SkeletalPhysicsCalculator {
    // Approximate de Leva (1996) segment mass fractions, normalized to total
    // body mass. These are population averages, not subject-specific masses.
    // Source: de Leva, "Adjustments to Zatsiorsky-Seluyanov's segment inertia
    // parameters", Journal of Biomechanics 29(9), 1996.
    val definitions = listOf(
        SegmentDefinition("head", LandmarkIndex.NOSE, LandmarkIndex.LEFT_SHOULDER, .0694, .50),
        SegmentDefinition("torso", LandmarkIndex.LEFT_SHOULDER, LandmarkIndex.LEFT_HIP, .4346, .50),
        SegmentDefinition("left.upper_arm", LandmarkIndex.LEFT_SHOULDER, LandmarkIndex.LEFT_ELBOW, .0271, .436, "torso"),
        SegmentDefinition("right.upper_arm", LandmarkIndex.RIGHT_SHOULDER, LandmarkIndex.RIGHT_ELBOW, .0271, .436, "torso"),
        SegmentDefinition("left.forearm", LandmarkIndex.LEFT_ELBOW, LandmarkIndex.LEFT_WRIST, .0162, .430, "left.upper_arm"),
        SegmentDefinition("right.forearm", LandmarkIndex.RIGHT_ELBOW, LandmarkIndex.RIGHT_WRIST, .0162, .430, "right.upper_arm"),
        SegmentDefinition("left.hand", LandmarkIndex.LEFT_WRIST, LandmarkIndex.LEFT_WRIST, .0061, .50, "left.forearm"),
        SegmentDefinition("right.hand", LandmarkIndex.RIGHT_WRIST, LandmarkIndex.RIGHT_WRIST, .0061, .50, "right.forearm"),
        SegmentDefinition("left.thigh", LandmarkIndex.LEFT_HIP, LandmarkIndex.LEFT_KNEE, .1416, .433, "torso"),
        SegmentDefinition("right.thigh", LandmarkIndex.RIGHT_HIP, LandmarkIndex.RIGHT_KNEE, .1416, .433, "torso"),
        SegmentDefinition("left.lower_leg", LandmarkIndex.LEFT_KNEE, LandmarkIndex.LEFT_ANKLE, .0433, .433, "left.thigh"),
        SegmentDefinition("right.lower_leg", LandmarkIndex.RIGHT_KNEE, LandmarkIndex.RIGHT_ANKLE, .0433, .433, "right.thigh"),
        SegmentDefinition("left.foot", LandmarkIndex.LEFT_ANKLE, LandmarkIndex.LEFT_FOOT_INDEX, .0137, .50, "left.lower_leg"),
        SegmentDefinition("right.foot", LandmarkIndex.RIGHT_ANKLE, LandmarkIndex.RIGHT_FOOT_INDEX, .0137, .50, "right.lower_leg")
    )

    fun calculate(snapshot: PhysicsSnapshot, previous: PhysicsSnapshot?, previousPrevious: PhysicsSnapshot?, previousPreviousPrevious: PhysicsSnapshot?, config: SkeletalPhysicsConfig): SkeletalPhysicsResult {
        val started = System.nanoTime()
        val source = snapshot.landmarks.associateBy { it.index }
        val useWorld = snapshot.worldLandmarkCount >= 3
        val unit = if (useWorld) PhysicsLengthUnit.METERS else PhysicsLengthUnit.NORMALIZED_IMAGE_UNITS
        fun point(index: Int): PhysicsVector3? = source[index]?.takeIf { it.confidence >= config.minLandmarkConfidence && (!useWorld || it.world) }?.let { PhysicsVector3(it.x.toDouble(), it.y.toDouble(), it.z.toDouble()) }
        fun confidence(index: Int) = source[index]?.confidence ?: 0f

        val shoulderMid = midpoint(point(LandmarkIndex.LEFT_SHOULDER), point(LandmarkIndex.RIGHT_SHOULDER))
        val hipMid = midpoint(point(LandmarkIndex.LEFT_HIP), point(LandmarkIndex.RIGHT_HIP))
        val points = source.keys.associateWith { point(it) }
        val segments = definitions.mapNotNull { definition ->
            val a = point(definition.proximal); val b = point(definition.distal)
            if (a == null || b == null) null else definition to Pair(a, b)
        }
        val centers = segments.associate { (definition, ends) ->
            definition.name to (ends.first + (ends.second - ends.first) * definition.centerOfMassFromProximal)
        }
        val masses = segments.associate { it.first.name to it.first.massFraction }
        val totalMass = masses.values.sum()
        val com = if (centers.isNotEmpty() && totalMass > 0.0) centers.entries.fold(PhysicsVector3(0.0, 0.0, 0.0)) { sum, entry -> sum + entry.value * (masses[entry.key]!! / totalMass) } else null
        val gravity = config.gravityDirection.normalized() ?: PhysicsVector3(0.0, -1.0, 0.0)

        val supportPoints = listOfNotNull(
            point(LandmarkIndex.LEFT_HEEL)?.let { SupportPoint("left.heel", it, confidence(LandmarkIndex.LEFT_HEEL)) },
            point(LandmarkIndex.LEFT_FOOT_INDEX)?.let { SupportPoint("left.toe", it, confidence(LandmarkIndex.LEFT_FOOT_INDEX)) },
            point(LandmarkIndex.RIGHT_HEEL)?.let { SupportPoint("right.heel", it, confidence(LandmarkIndex.RIGHT_HEEL)) },
            point(LandmarkIndex.RIGHT_FOOT_INDEX)?.let { SupportPoint("right.toe", it, confidence(LandmarkIndex.RIGHT_FOOT_INDEX)) },
            point(LandmarkIndex.LEFT_WRIST)?.let { SupportPoint("left.hand.contact_candidate", it, confidence(LandmarkIndex.LEFT_WRIST)) },
            point(LandmarkIndex.RIGHT_WRIST)?.let { SupportPoint("right.hand.contact_candidate", it, confidence(LandmarkIndex.RIGHT_WRIST)) }
        )

        val orientations = segments.mapNotNull { (definition, ends) ->
            val direction = (ends.second - ends.first).normalized() ?: return@mapNotNull null
            val inclination = acos(direction.dot(gravity).coerceIn(-1.0, 1.0)) * 180.0 / Math.PI
            val parent = definition.parent?.let { centers[it] }
            val parentDirection = definition.parent?.let { parentName -> segments.firstOrNull { it.first.name == parentName }?.second?.let { e -> (e.second - e.first).normalized() } }
            val relative = parentDirection?.let { acos(direction.dot(it).coerceIn(-1.0, 1.0)) * 180.0 / Math.PI }
            definition.name to SegmentOrientation(direction, inclination, relative, min(confidence(definition.proximal), confidence(definition.distal)))
        }.toMap()
        val supportPolygon = buildSupportPolygon(supportPoints.filter { it.name in config.assumedContactPointNames }, config.supportPlaneNormal)
        val stability = if (supportPolygon != null && com != null) stabilityMargin(com, supportPolygon) else null

        val metricArm = mutableMapOf<String, PhysicsMeasurement>()
        val torques = mutableMapOf<String, PhysicsVector3>()
        val jointIndices = mapOf("left.shoulder" to LandmarkIndex.LEFT_SHOULDER, "right.shoulder" to LandmarkIndex.RIGHT_SHOULDER, "left.elbow" to LandmarkIndex.LEFT_ELBOW, "right.elbow" to LandmarkIndex.RIGHT_ELBOW, "left.hip" to LandmarkIndex.LEFT_HIP, "right.hip" to LandmarkIndex.RIGHT_HIP, "left.knee" to LandmarkIndex.LEFT_KNEE, "right.knee" to LandmarkIndex.RIGHT_KNEE, "left.ankle" to LandmarkIndex.LEFT_ANKLE, "right.ankle" to LandmarkIndex.RIGHT_ANKLE)
        jointIndices.forEach { (name, index) ->
            val joint = point(index) ?: return@forEach
            val arm = (com?.minus(joint))?.cross(gravity)?.norm()
            if (arm != null) {
                metricArm[name] = PhysicsMeasurement(arm, if (unit == PhysicsLengthUnit.METERS) "m" else "normalized_length", confidence(index))
                if (unit == PhysicsLengthUnit.METERS) {
                    torques[name] = segments.fold(PhysicsVector3(0.0, 0.0, 0.0)) { total, (segment, _) ->
                        val segmentCenter = centers[segment.name] ?: return@fold total
                        total + (segmentCenter - joint).cross(gravity * (9.80665 * segment.massFraction / totalMass))
                    }
                }
            }
        }

        val linear = dynamics(snapshot, previous, previousPrevious, previousPreviousPrevious, config)
        val angular = angularDynamics(snapshot, previous, previousPrevious, config)
        val unavailable = mutableMapOf<String, String>()
        if (com == null) unavailable["centerOfMass"] = "Insufficient confident landmarks"
        if (!useWorld) unavailable["normalizedGravitationalTorquesNmPerKg"] = "World landmarks in meters are unavailable"
        if (supportPolygon == null) unavailable["supportPolygon"] = "Contact state and ground plane cannot be inferred reliably from landmarks alone"
        if (stability == null) unavailable["stabilityMargin"] = "Support polygon unavailable"
        return SkeletalPhysicsResult(snapshot.timestampNs, unit, com, gravity, supportPoints, supportPolygon, stability, metricArm, torques, orientations, linear, angular, masses, when { com == null -> PhysicsValidity.UNAVAILABLE; unavailable.isNotEmpty() -> PhysicsValidity.PARTIAL; else -> PhysicsValidity.VALID }, snapshot.landmarks.map { it.confidence }.average().toFloat(), unavailable, (System.nanoTime() - started) / 1_000_000, snapshot.imageLandmarkCount, snapshot.worldLandmarkCount)
    }

    private fun midpoint(a: PhysicsVector3?, b: PhysicsVector3?) = if (a == null || b == null) null else (a + b) * .5

    private fun dynamics(current: PhysicsSnapshot, previous: PhysicsSnapshot?, previousPrevious: PhysicsSnapshot?, previousPreviousPrevious: PhysicsSnapshot?, config: SkeletalPhysicsConfig): Map<String, KinematicMeasurement> {
        if (previous == null) return emptyMap()
        val dt = (current.timestampNs - previous.timestampNs).toDouble() / 1e9
        if (dt <= 0.0) return emptyMap()
        val now = centerMap(current, config)
        val old = centerMap(previous, config)
        val older = previousPrevious?.let { centerMap(it, config) }
        val oldest = previousPreviousPrevious?.let { centerMap(it, config) }
        val oldDt = previousPrevious?.let { (previous.timestampNs - it.timestampNs).toDouble() / 1e9 } ?: dt
        return now.mapNotNull { (name, position) ->
            val oldPosition = old[name] ?: return@mapNotNull null
            val velocity = (position - oldPosition) * (1.0 / dt)
            val oldVelocity = older?.get(name)?.let { (oldPosition - it) * (1.0 / oldDt.coerceAtLeast(1e-9)) }
            val acceleration = oldVelocity?.let { (velocity - it) * (1.0 / dt) }
            val oldOldVelocity = oldest?.get(name)?.let { older?.get(name)?.let { oldPosition2 -> (oldPosition2 - it) * (1.0 / oldDt.coerceAtLeast(1e-9)) } }
            val oldAcceleration = oldVelocity?.let { oldOldVelocity?.let { olderVelocity -> (it - olderVelocity) * (1.0 / oldDt.coerceAtLeast(1e-9)) } }
            val jerk = acceleration?.let { oldAcceleration?.let { olderAcceleration -> (it - olderAcceleration) * (1.0 / dt) } }
            name to KinematicMeasurement(velocity, acceleration, jerk, 1f)
        }.toMap()
    }

    private fun angularDynamics(current: PhysicsSnapshot, previous: PhysicsSnapshot?, previousPrevious: PhysicsSnapshot?, config: SkeletalPhysicsConfig): Map<String, AngularKinematicMeasurement> {
        if (previous == null) return emptyMap()
        val dt = (current.timestampNs - previous.timestampNs).toDouble() / 1e9
        if (dt <= 0.0) return emptyMap()
        val now = directionMap(current, config)
        val old = directionMap(previous, config)
        val older = previousPrevious?.let { directionMap(it, config) }
        val oldDt = previousPrevious?.let { (previous.timestampNs - it.timestampNs).toDouble() / 1e9 } ?: dt
        return now.mapNotNull { (name, direction) ->
            val oldDirection = old[name] ?: return@mapNotNull null
            val velocity = angularVelocity(oldDirection, direction, dt)
            val oldVelocity = older?.get(name)?.let { angularVelocity(it, oldDirection, oldDt.coerceAtLeast(1e-9)) }
            val acceleration = oldVelocity?.let { (velocity - it) * (1.0 / dt) }
            name to AngularKinematicMeasurement(velocity, acceleration, 1f)
        }.toMap()
    }

    private fun centerMap(snapshot: PhysicsSnapshot, config: SkeletalPhysicsConfig): Map<String, PhysicsVector3> {
        val points = snapshot.landmarks.associateBy { it.index }
        val useWorld = snapshot.worldLandmarkCount >= 3
        fun point(index: Int) = points[index]?.takeIf { it.confidence >= config.minLandmarkConfidence && (!useWorld || it.world) }?.let { PhysicsVector3(it.x.toDouble(), it.y.toDouble(), it.z.toDouble()) }
        return definitions.mapNotNull { d -> val a = point(d.proximal); val b = point(d.distal); if (a == null || b == null) null else d.name to (a + (b - a) * d.centerOfMassFromProximal) }.toMap()
    }

    private fun directionMap(snapshot: PhysicsSnapshot, config: SkeletalPhysicsConfig): Map<String, PhysicsVector3> {
        val points = snapshot.landmarks.associateBy { it.index }
        val useWorld = snapshot.worldLandmarkCount >= 3
        fun point(index: Int) = points[index]?.takeIf { it.confidence >= config.minLandmarkConfidence && (!useWorld || it.world) }?.let { PhysicsVector3(it.x.toDouble(), it.y.toDouble(), it.z.toDouble()) }
        return definitions.mapNotNull { d -> val a = point(d.proximal); val b = point(d.distal); val direction = if (a == null || b == null) null else (b - a).normalized(); direction?.let { d.name to it } }.toMap()
    }

    private fun angularVelocity(old: PhysicsVector3, now: PhysicsVector3, dt: Double): PhysicsVector3 {
        val axis = old.cross(now)
        val angle = acos(old.dot(now).coerceIn(-1.0, 1.0))
        return if (axis.norm() < 1e-9) PhysicsVector3(0.0, 0.0, 0.0) else axis.normalized()!! * (angle / dt)
    }

    private fun buildSupportPolygon(points: List<SupportPoint>, planeNormal: PhysicsVector3?): SupportPolygon? {
        val normal = planeNormal?.normalized() ?: return null
        if (points.size < 3) return null
        val reference = if (kotlin.math.abs(normal.x) < .8) PhysicsVector3(1.0, 0.0, 0.0) else PhysicsVector3(0.0, 1.0, 0.0)
        val axisU = normal.cross(reference).normalized() ?: return null
        val axisV = normal.cross(axisU).normalized() ?: return null
        data class Projected(val point: PhysicsVector3, val x: Double, val y: Double)
        val projected = points.map { Projected(it.position, it.position.dot(axisU), it.position.dot(axisV)) }.sortedWith(compareBy<Projected> { it.x }.thenBy { it.y })
        fun cross(o: Projected, a: Projected, b: Projected) = (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
        val lower = mutableListOf<Projected>()
        projected.forEach { p -> while (lower.size >= 2 && cross(lower[lower.size - 2], lower.last(), p) <= 0.0) lower.removeAt(lower.lastIndex); lower.add(p) }
        val upper = mutableListOf<Projected>()
        projected.asReversed().forEach { p -> while (upper.size >= 2 && cross(upper[upper.size - 2], upper.last(), p) <= 0.0) upper.removeAt(upper.lastIndex); upper.add(p) }
        val hull = (lower.dropLast(1) + upper.dropLast(1)).map { it.point }
        return hull.takeIf { it.size >= 3 }?.let { SupportPolygon(it, normal, points.minOf { p -> p.confidence }) }
    }

    private fun stabilityMargin(com: PhysicsVector3, polygon: SupportPolygon): PhysicsMeasurement? {
        val origin = polygon.points.firstOrNull() ?: return null
        val projected = com - polygon.planeNormal * (com - origin).dot(polygon.planeNormal)
        val reference = if (kotlin.math.abs(polygon.planeNormal.x) < .8) PhysicsVector3(1.0, 0.0, 0.0) else PhysicsVector3(0.0, 1.0, 0.0)
        val u = polygon.planeNormal.cross(reference).normalized() ?: return null
        val v = polygon.planeNormal.cross(u).normalized() ?: return null
        val px = projected.dot(u); val py = projected.dot(v)
        val signedEdges = polygon.points.indices.map { i ->
            val a = polygon.points[i]; val b = polygon.points[(i + 1) % polygon.points.size]
            val ax = a.dot(u); val ay = a.dot(v); val bx = b.dot(u); val by = b.dot(v)
            (bx - ax) * (py - ay) - (by - ay) * (px - ax)
        }
        val orientation = signedEdges.minOrNull()?.let { if (it >= 0.0) 1.0 else -1.0 } ?: return null
        val edgeDistances = polygon.points.indices.map { i ->
            val a = polygon.points[i]; val b = polygon.points[(i + 1) % polygon.points.size]
            val edge = b - a
            (projected - a).cross(edge).dot(polygon.planeNormal) / edge.norm().coerceAtLeast(1e-9)
        }
        return PhysicsMeasurement((edgeDistances.minOrNull() ?: return null) * orientation, "m", polygon.confidence)
    }
}
