package com.example.exerciseform.sdk.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.exerciseform.sdk.movementscoring.*
import java.util.Locale

@Composable
fun MovementScoringDashboard(result: MovementScoringResult, modifier: Modifier = Modifier) {
    Column(modifier.background(Color.Black.copy(alpha = .88f), MaterialTheme.shapes.medium).padding(14.dp).verticalScroll(rememberScrollState())) {
        Text("Temporal movement scoring", color = Color.White, fontSize = 18.sp)
        Text("Observable behaviour metrics only", color = Color.LightGray, fontSize = 11.sp)
        ScoreLine("Immediate", result.immediateBehaviourScore)
        ScoreLine("Temporal", result.temporalBehaviourScore)
        ScoreLine("Session", result.sessionBehaviourScore)
        Text("Tracking: ${result.trackingReliability?.let { fmt(it) } ?: "N/A"}", color = Color.LightGray, fontSize = 12.sp)
        Spacer(Modifier.height(8.dp))
        result.dimensions.forEach { dimension ->
            Text("${dimension.name}: ${dimension.score?.let { fmt(it) } ?: "N/A"}", color = Color.White, fontSize = 13.sp)
            Text(dimension.evidence.reason, color = Color.Gray, fontSize = 10.sp)
            Text("raw ${dimension.evidence.rawMeasurements.entries.joinToString { "${it.key}=${it.value?.let(::fmt) ?: "N/A"}" }}", color = Color.Gray, fontSize = 10.sp)
            Spacer(Modifier.height(4.dp))
        }
        Text("Timescales", color = Color.White, fontSize = 14.sp)
        result.timescales.toSortedMap().forEach { (window, score) ->
            Text("${window} ms: ${score.compositeScore?.let { fmt(it) } ?: "N/A"} (${score.dimensions.count { it.evidence.validity == ScoreValidity.VALID }} dimensions)", color = Color.LightGray, fontSize = 12.sp)
        }
        val trend = result.trend
        Text("Trend: current ${trend.currentScore?.let(::fmt) ?: "N/A"}, mean ${trend.rollingMean?.let(::fmt) ?: "N/A"}, change/s ${trend.rateOfChangePerSecond?.let(::fmt) ?: "N/A"}", color = Color.LightGray, fontSize = 12.sp)
        Text("Duration: ${result.sessionDurationMs} ms   Compute: ${result.computationTimeMs} ms", color = Color.Gray, fontSize = 11.sp)
    }
}

@Composable private fun ScoreLine(label: String, value: Float?) {
    Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, color = Color.White, fontSize = 14.sp)
        Text(value?.let(::fmt) ?: "N/A", color = Color.LightGray, fontSize = 14.sp)
    }
}

private fun fmt(value: Float): String = String.format(Locale.US, "%.1f", value)
