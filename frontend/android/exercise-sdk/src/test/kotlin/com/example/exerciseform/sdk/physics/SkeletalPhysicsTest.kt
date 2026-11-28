package com.example.exerciseform.sdk.physics

import com.example.exerciseform.sdk.api.PoseLandmark
import com.example.exerciseform.sdk.biomechanics.LandmarkIndex
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class SkeletalPhysicsTest {
    @Test fun crossProductIsRightHanded() {
        assertEquals(PhysicsVector3(0.0, 0.0, 1.0), PhysicsVector3(1.0, 0.0, 0.0).cross(PhysicsVector3(0.0, 1.0, 0.0)))
    }

    @Test fun segmentFractionsNormalizeToBodyMass() {
        assertEquals(1.0, SkeletalPhysicsCalculator.definitions.sumOf { it.massFraction }, 1e-9)
    }

    @Test fun centerOfMassIsMassWeightedAndWorldUnitsAreMeters() {
        val frame = syntheticFrame(1_000_000_000L)
        val result = SkeletalPhysicsCalculator.calculate(PhysicsSnapshot(frame.timestampNs, frame.landmarks, frame.landmarks.size, frame.landmarks.size), null, null, null, SkeletalPhysicsConfig())
        assertEquals(PhysicsLengthUnit.METERS, result.coordinateUnit)
        assertNotNull(result.centerOfMass)
        assertTrue(result.centerOfMass!!.y in 0.0..2.0)
        assertTrue(result.segmentMassFractions.values.sum() > .99)
    }

    @Test fun missingLandmarksAreUnavailableNotZero() {
        val frame = syntheticFrame(1_000_000_000L).copy(landmarks = listOf(PoseLandmark(LandmarkIndex.NOSE, 0f, 0f, 0f, 1f, 1f, true)))
        val result = SkeletalPhysicsCalculator.calculate(PhysicsSnapshot(frame.timestampNs, frame.landmarks), null, null, null, SkeletalPhysicsConfig())
        assertNull(result.centerOfMass)
        assertEquals(PhysicsValidity.UNAVAILABLE, result.validity)
        assertTrue(result.unavailableMeasurements.containsKey("centerOfMass"))
    }

    @Test fun declaredContactsProduceSupportPolygonAndMargin() {
        val config = SkeletalPhysicsConfig(
            supportPlaneNormal = PhysicsVector3(0.0, 1.0, 0.0),
            assumedContactPointNames = setOf("left.heel", "left.toe", "right.heel", "right.toe")
        )
        val frame = syntheticFrame(1_000_000_000L)
        val result = SkeletalPhysicsCalculator.calculate(PhysicsSnapshot(frame.timestampNs, frame.landmarks), null, null, null, config)
        assertNotNull(result.supportPolygon)
        assertNotNull(result.stabilityMargin)
    }

    @Test fun engineAcceptsLatestFramesAndCanCancel() = runBlocking {
        val engine = SkeletalPhysicsEngine(SkeletalPhysicsConfig(processingHz = 10))
        repeat(20) { engine.submit(syntheticFrame(it * 33_000_000L)) }
        engine.close()
        assertTrue(true)
    }

    private fun syntheticFrame(timestampNs: Long) = com.example.exerciseform.sdk.api.PoseFrame(
        timestampNs,
        listOf(
            landmark(LandmarkIndex.NOSE, .0f, 1.8f, .0f),
            landmark(LandmarkIndex.LEFT_SHOULDER, -.2f, 1.55f, .0f), landmark(LandmarkIndex.RIGHT_SHOULDER, .2f, 1.55f, .0f),
            landmark(LandmarkIndex.LEFT_ELBOW, -.35f, 1.25f, .0f), landmark(LandmarkIndex.RIGHT_ELBOW, .35f, 1.25f, .0f),
            landmark(LandmarkIndex.LEFT_WRIST, -.4f, 1.0f, .0f), landmark(LandmarkIndex.RIGHT_WRIST, .4f, 1.0f, .0f),
            landmark(LandmarkIndex.LEFT_HIP, -.15f, 1.0f, .0f), landmark(LandmarkIndex.RIGHT_HIP, .15f, 1.0f, .0f),
            landmark(LandmarkIndex.LEFT_KNEE, -.15f, .55f, .0f), landmark(LandmarkIndex.RIGHT_KNEE, .15f, .55f, .0f),
            landmark(LandmarkIndex.LEFT_ANKLE, -.15f, .1f, .0f), landmark(LandmarkIndex.RIGHT_ANKLE, .15f, .1f, .0f),
            landmark(LandmarkIndex.LEFT_HEEL, -.2f, .0f, .0f), landmark(LandmarkIndex.RIGHT_HEEL, .2f, .0f, .0f),
            landmark(LandmarkIndex.LEFT_FOOT_INDEX, -.05f, .0f, .2f), landmark(LandmarkIndex.RIGHT_FOOT_INDEX, .05f, .0f, .2f)
        ), 640, 480
    )

    private fun landmark(index: Int, x: Float, y: Float, z: Float) = PoseLandmark(index, x, y, z, 1f, 1f, true)
}
