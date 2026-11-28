package com.example.exerciseform.sdk.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.exerciseform.sdk.movementobserver.MovementObserverResult
import kotlin.math.max

private val dashboardJoints = listOf("left.knee", "right.knee", "left.hip", "right.hip", "left.elbow", "right.elbow", "left.shoulder", "right.shoulder", "left.ankle", "right.ankle")

@Composable
fun MovementObserverDashboard(result: MovementObserverResult, modifier: Modifier = Modifier) {
    var selectedIndex by remember { mutableIntStateOf(0) }
    val joint = dashboardJoints[selectedIndex % dashboardJoints.size]
    Column(modifier.background(Color.Black.copy(alpha = .86f), RoundedCornerShape(14.dp)).padding(12.dp).verticalScroll(rememberScrollState())) {
        Text("MOVEMENT OBSERVER", color = Color.White, fontSize = 13.sp)
        Text("COMPOSITE MOVEMENT", color = Color(0xFF80CBC4), fontSize = 11.sp)
        MetricGraph(result.compositeMovementRateHistory, Color(0xFF80CBC4), Modifier.fillMaxWidth().height(52.dp))
        Text("RATE ${result.continuity.movementRateDegreesPerSecond.metric()}°/s   ACC ${result.continuity.compositeAcceleration.metric()}   JERK ${result.continuity.compositeJerk.metric()}", color = Color.LightGray, fontSize = 11.sp)
        Text("PER-JOINT CONTRIBUTION: " + result.continuity.perJointContribution.entries.joinToString("  ") { "${it.key} ${it.value.metric()}" }, color = Color.LightGray, fontSize = 10.sp, maxLines = 3)
        MetricGraph(result.compositeAccelerationHistory, Color(0xFF90CAF9), Modifier.fillMaxWidth().height(42.dp))
        MetricGraph(result.compositeJerkHistory, Color(0xFFFFCC80), Modifier.fillMaxWidth().height(42.dp))

        Text("JOINT OBSERVATIONS", color = Color(0xFF80CBC4), fontSize = 11.sp)
        Text("SELECTED: $joint  (tap to change)", color = Color.White, fontSize = 11.sp, modifier = Modifier.clickable { selectedIndex = (selectedIndex + 1) % dashboardJoints.size }.padding(vertical = 4.dp))
        Text("LINEARITY R²", color = Color.LightGray, fontSize = 10.sp)
        MetricGraph(result.jointLinearityHistory[joint].orEmpty(), Color(0xFFB39DDB), Modifier.fillMaxWidth().height(38.dp))
        Text("RESIDUAL", color = Color.LightGray, fontSize = 10.sp)
        MetricGraph(result.jointResidualHistory[joint].orEmpty(), Color(0xFFCE93D8), Modifier.fillMaxWidth().height(38.dp))
        Text("VELOCITY / ACCELERATION / JERK", color = Color.LightGray, fontSize = 10.sp)
        MetricGraph(result.jointVelocityHistory[joint].orEmpty(), Color(0xFF81D4FA), Modifier.fillMaxWidth().height(38.dp))
        MetricGraph(result.jointAccelerationHistory[joint].orEmpty(), Color(0xFFFFAB91), Modifier.fillMaxWidth().height(38.dp))
        MetricGraph(result.jointJerkHistory[joint].orEmpty(), Color(0xFFFFE082), Modifier.fillMaxWidth().height(38.dp))
        Text("ANGLE VARIATION: ${result.stability[joint]?.standardDeviationDegrees.metric()}°   RANGE: ${result.stability[joint]?.rangeOfMotionDegrees.metric()}°", color = Color.LightGray, fontSize = 10.sp)

        Text("COORDINATION", color = Color(0xFF80CBC4), fontSize = 11.sp)
        result.coordination.forEach { pair -> Text("${pair.firstJoint} ↔ ${pair.secondJoint}: ${pair.signedCorrelationAtStrongestLag.metric()} @ ${pair.lagMs ?: "--"} ms", color = Color.LightGray, fontSize = 10.sp) }
        Text("TRACKING", color = Color(0xFF80CBC4), fontSize = 11.sp)
        Text("VALID ${result.tracking.validJointCount}/${dashboardJoints.size} (${result.tracking.validJointPercentage.metric()}%)   CONF ${result.tracking.meanLandmarkConfidence?.times(100f).metric()}%", color = Color.LightGray, fontSize = 10.sp)
        Text("SAMPLE ${result.tracking.effectiveSamplingHz.metric()} Hz   INTERVAL SD ${result.tracking.frameIntervalStdMs.metric()} ms   MISSING ${result.tracking.missingJointPercentage.metric()}%", color = Color.LightGray, fontSize = 10.sp)
        Text("DURATION ${result.tracking.observationDurationMs} ms   BUFFER ${result.bufferSize}   ENGINE ${result.computationTimeMs} ms", color = Color.LightGray, fontSize = 10.sp)
        Text("PERF ${result.performance.meanMs.metric()} ms mean / ${result.performance.p95Ms.metric()} ms P95 / ${result.performance.p99Ms.metric()} ms P99 (${result.performance.sampleCount} samples)", color = Color.LightGray, fontSize = 10.sp)
    }
}

@Composable
private fun MetricGraph(values: List<Float>, color: Color, modifier: Modifier) {
    Canvas(modifier.padding(vertical = 2.dp)) {
        if (values.size < 2) return@Canvas
        val low = values.minOrNull() ?: 0f
        val high = max(values.maxOrNull() ?: 1f, low + 1e-4f)
        values.zipWithNext().forEachIndexed { index, pair ->
            val a = Offset(index.toFloat() / (values.size - 1) * size.width, size.height - ((pair.first - low) / (high - low)) * size.height)
            val b = Offset((index + 1).toFloat() / (values.size - 1) * size.width, size.height - ((pair.second - low) / (high - low)) * size.height)
            drawLine(color, a, b, 2f)
        }
    }
}

private fun Float?.metric(): String = this?.takeIf { it.isFinite() }?.let { "%.2f".format(it) } ?: "--"
