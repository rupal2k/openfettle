package com.example.exerciseform.sdk.movementobserver

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MovementObserverTest {
    private fun frames(values: List<Float>, name: String = "left.knee") = values.mapIndexed { index, value ->
        MovementFrame(index * 100_000_000L, mapOf(name to value), mapOf(name to 1f))
    }

    @Test fun linearSignalHasHighLocalR2() {
        val metric = LocalLinearityObserver(500).observe(frames((0..5).map { it * 10f })).getValue("left.knee")
        assertTrue(metric.rSquared!! > .999f)
        assertEquals(100f, metric.slopeDegreesPerSecond!!, .01f)
    }

    @Test fun constantSignalIsStableAndLinear() {
        val metric = LocalLinearityObserver().observe(frames(List(6) { 42f })).getValue("left.knee")
        assertEquals(1f, metric.rSquared!!, .0001f)
        assertEquals(0f, metric.rmsResidualDegrees!!, .0001f)
    }

    @Test fun opposingJointsDoNotCancelCompositeDisplacement() {
        val sequence = (0..5).map { i -> MovementFrame(i * 100_000_000L, mapOf("left.knee" to i.toFloat(), "right.knee" to (10 - i).toFloat()), mapOf("left.knee" to 1f, "right.knee" to 1f)) }
        val result = CompositeContinuityObserver().observe(sequence)
        assertTrue(result.displacementDegrees!! > 0f)
        assertTrue(result.validJointPercentage > 0f)
    }

    @Test fun missingAndNonFiniteValuesAreExcluded() {
        val input = listOf(MovementFrame(0, mapOf("left.knee" to 1f), mapOf("left.knee" to 1f)), MovementFrame(100_000_000L, mapOf("left.knee" to Float.NaN, "right.knee" to 2f), mapOf("left.knee" to .1f, "right.knee" to 1f)))
        val result = CompositeContinuityObserver().observe(input)
        assertEquals(0f, result.validJointPercentage, .001f)
    }
    @Test fun quadraticSignalHasFiniteDerivativeWithIrregularTimestamps() {
        val times = listOf(0L, 80_000_000L, 210_000_000L, 350_000_000L, 500_000_000L)
        val input = times.mapIndexed { index, timestamp -> MovementFrame(timestamp, mapOf("left.knee" to index.toFloat() * index), mapOf("left.knee" to 1f)) }
        val metric = MovementSmoothnessObserver().observe(input).getValue("left.knee")
        assertTrue(metric.rmsVelocity!!.isFinite())
        assertTrue(metric.rmsAcceleration!!.isFinite())
    }

    @Test fun identicalTimestampsDoNotCreateInfiniteDerivatives() {
        val input = listOf(MovementFrame(0, mapOf("left.knee" to 1f), mapOf("left.knee" to 1f)), MovementFrame(0, mapOf("left.knee" to 2f), mapOf("left.knee" to 1f)))
        val metric = MovementSmoothnessObserver().observe(input).getValue("left.knee")
        assertEquals(null, metric.currentVelocity)
    }

    @Test fun phaseShiftedCoordinationReturnsBoundedCorrelation() {
        val input = (0..20).map { i ->
            val left = kotlin.math.sin(i / 3.0).toFloat()
            val right = kotlin.math.sin((i - 1) / 3.0).toFloat()
            MovementFrame(i * 100_000_000L, mapOf("left.hip" to left, "left.knee" to right), mapOf("left.hip" to 1f, "left.knee" to 1f))
        }
        val metric = JointCoordinationObserver(500).observe(input).first { it.firstJoint == "left.hip" && it.secondJoint == "left.knee" }
        assertTrue(metric.maximumAbsoluteCorrelation == null || metric.maximumAbsoluteCorrelation!! <= 1f)
    }
}
