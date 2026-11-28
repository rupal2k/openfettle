package com.example.exerciseform.sdk.movementscoring

import com.example.exerciseform.sdk.movementobserver.*
import org.junit.Assert.*
import org.junit.Test

class MovementScoringTest {
    @Test fun normalizerIsBoundedAndExplicit() {
        val n = MovementMetricNormalizer(MovementScoringConfig(residualScaleDegrees = 10f))
        assertEquals(100f, n.residualScore(0f)!!, 0.001f)
        assertEquals(0f, n.residualScore(20f)!!, 0.001f)
        assertNull(n.residualScore(null))
    }

    @Test fun missingDimensionsDoNotCreateComposite() {
        val r = CompositeScoreAggregator(2).aggregate(listOf(
            DimensionScore("a", 50f, ScoreEvidence("a", 50f, emptyMap(), "test", 100, emptyList(), 1, 100f, ScoreValidity.VALID, "test")),
            DimensionScore("b", null, ScoreEvidence("b", null, emptyMap(), "test", 100, emptyList(), 1, 0f, ScoreValidity.INSUFFICIENT_DATA, "missing"))
        ))
        assertNull(r.first)
        assertTrue(r.second.isEmpty())
    }

    @Test fun scorerIsDeterministicAndDoesNotLabelPosture() {
        val result = MovementObserverResult(
            timestampNs = 2_000_000_000L,
            frameAnglesDegrees = mapOf("left.knee" to 90f),
            linearity = mapOf("left.knee" to LinearityMetric(1f, .9f, 2f, 3f)),
            smoothness = mapOf("left.knee" to SmoothnessMetric(2f, 3f, 4f, 2f, 3f, 4f, 5f)),
            stability = mapOf("left.knee" to StabilityMetric(90f, 2f, 4f, 88f, 92f, 4f, 1f)),
            continuity = ContinuityMetric(movementRateDegreesPerSecond = 2f, rollingMeanRate = 2f, peakRate = 3f, validJointPercentage = 100f),
            tracking = TrackingReliability(validJointCount = 1, validJointPercentage = 100f, observationDurationMs = 2_000),
            compositeMovementRateHistory = listOf(1f, 2f, 1.5f, 2f), bufferSize = 4
        )
        val engine = TemporalMovementScoringEngine(MovementScoringConfig(executionFrequencyHz = 100))
        val scorer = MovementContinuityScorer(MovementMetricNormalizer(MovementScoringConfig()))
        val a = scorer.score(result, 500)
        val b = scorer.score(result, 500)
        assertEquals(a.score, b.score)
        assertTrue(a.score!! in 0f..100f)
        engine.close()
    }

    @Test fun stationaryStabilityCanBeNotApplicableWithoutFabrication() {
        val result = MovementObserverResult(
            continuity = ContinuityMetric(movementRateDegreesPerSecond = 20f),
            stability = mapOf("joint" to StabilityMetric(0f, 1f)),
            tracking = TrackingReliability(observationDurationMs = 1_000)
        )
        val score = AngularStabilityScorer(MovementMetricNormalizer(MovementScoringConfig())).score(result, 500)
        assertNull(score.score)
        assertEquals(ScoreValidity.NOT_APPLICABLE, score.evidence.validity)
    }
}
