package com.example.exerciseform.sdk.ui

import android.content.Context
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cameraswitch
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.LifecycleOwner
import com.example.exerciseform.sdk.api.*
import com.example.exerciseform.sdk.camera.CameraXAdapter
import kotlin.math.*

data class ExerciseFormPreviewOptions(
    val showJoints: Boolean = true,
    val showGraph: Boolean = true,
    val showPosture: Boolean = true,
    val showCameraToggle: Boolean = true,
    val graphHistorySize: Int = 120
)

class ExerciseFormPreviewDsl {
    var showJoints = true
    var showGraph = true
    var showPosture = true
    var showCameraToggle = true
    var graphHistorySize = 120
    fun build() = ExerciseFormPreviewOptions(showJoints, showGraph, showPosture, showCameraToggle, graphHistorySize)
}

fun exerciseFormPreviewOptions(block: ExerciseFormPreviewDsl.() -> Unit = {}): ExerciseFormPreviewOptions = ExerciseFormPreviewDsl().apply(block).build()

/** SDK-owned camera, skeleton, angle overlay, graph and posture controls. */
@Composable
fun ExerciseFormPreview(
    engine: ExerciseFormEngine,
    context: Context,
    owner: LifecycleOwner,
    options: ExerciseFormPreviewOptions = ExerciseFormPreviewOptions()
) {
    var showJoints by remember { mutableStateOf(options.showJoints) }
    var showObserver by remember { mutableStateOf(false) }
    val result by engine.results.collectAsStateWithLifecycle()
    val movementObserver by engine.movementObserverResults.collectAsStateWithLifecycle()
    val camera = remember { CameraXAdapter(context, engine) }
    DisposableEffect(camera) { onDispose { camera.close() } }
    Box(Modifier.fillMaxSize().background(Color.Black)) {
        AndroidView(
            factory = { context -> PreviewView(context).also { camera.bind(owner, it) } },
            modifier = Modifier.fillMaxSize()
        )
        if (showJoints) PoseOverlay(result)
        if (showObserver) MovementObserverDashboard(movementObserver, Modifier.align(androidx.compose.ui.Alignment.TopCenter).fillMaxWidth().padding(12.dp, top = 72.dp))
        IconButton({ showJoints = !showJoints }, Modifier.padding(10.dp).size(52.dp).background(Color.Black.copy(.55f), CircleShape)) {
            Icon(if (showJoints) Icons.Default.Visibility else Icons.Default.VisibilityOff, null, tint = Color.White)
        }
        IconButton({ showObserver = !showObserver }, Modifier.align(androidx.compose.ui.Alignment.TopEnd).padding(10.dp).size(52.dp).background(Color.Black.copy(.55f), CircleShape)) {
            Text("M", color = Color.White, fontSize = 18.sp)
        }
        if (options.showCameraToggle) IconButton({ camera.toggleCamera(owner) }, Modifier.align(androidx.compose.ui.Alignment.BottomEnd).padding(10.dp).size(52.dp).background(Color.Black.copy(.55f), CircleShape)) {
            Icon(Icons.Default.Cameraswitch, "Switch camera", tint = Color.White)
        }
    }
}

@Composable
private fun PoseOverlay(result: SdkResult?) {
    val points = result?.pose?.landmarks?.filter { it.confidence >= .55f }.orEmpty()
    val metrics = result?.metrics.orEmpty()
    BoxWithConstraints(Modifier.fillMaxSize()) {
        Canvas(Modifier.fillMaxSize()) {
            val byIndex = points.associateBy { it.index }
            points.forEach { drawCircle(Color.Cyan, 5f, Offset(it.x * size.width, it.y * size.height)) }
            val bones = listOf(11 to 12, 11 to 13, 13 to 15, 12 to 14, 14 to 16, 11 to 23, 12 to 24, 23 to 24, 23 to 25, 25 to 27, 24 to 26, 26 to 28)
            bones.forEach { (a, b) -> val p = byIndex[a]; val q = byIndex[b]; if (p != null && q != null) drawLine(Color.Cyan, Offset(p.x * size.width, p.y * size.height), Offset(q.x * size.width, q.y * size.height), 3f) }
            angleOverlays().forEach { joint ->
                val a = byIndex[joint.first] ?: return@forEach; val v = byIndex[joint.vertex] ?: return@forEach; val b = byIndex[joint.second] ?: return@forEach
                if (metrics.none { it.name == joint.name }) return@forEach
                val start = Math.toDegrees(atan2((a.y - v.y).toDouble(), (a.x - v.x).toDouble())).toFloat()
                val end = Math.toDegrees(atan2((b.y - v.y).toDouble(), (b.x - v.x).toDouble())).toFloat()
                drawArc(Color.Yellow, start, shortestSweep(start, end), false, Offset(v.x * size.width - 24f, v.y * size.height - 24f), androidx.compose.ui.geometry.Size(48f, 48f), style = Stroke(3f))
            }
        }
        val byIndex = points.associateBy { it.index }; val metricsByName = metrics.associateBy { it.name }
        angleOverlays().mapNotNull { joint ->
            val v = byIndex[joint.vertex] ?: return@mapNotNull null; val metric = metricsByName[joint.name] ?: return@mapNotNull null
            Triple("${metric.value.toInt()}°", v.x, v.y)
        }.forEach { (text, x, y) -> Text(text = text, color = Color.White, fontSize = 12.sp, modifier = Modifier.offset { IntOffset((x * maxWidth.toPx()).roundToInt(), (y * maxHeight.toPx()).roundToInt()) }) }
    }
}

private data class AngleOverlay(val name: String, val first: Int, val vertex: Int, val second: Int)
private fun angleOverlays() = listOf(AngleOverlay("left.elbow", 11, 13, 15), AngleOverlay("right.elbow", 12, 14, 16), AngleOverlay("left.knee", 23, 25, 27), AngleOverlay("right.knee", 24, 26, 28), AngleOverlay("left.hip", 11, 23, 25), AngleOverlay("right.hip", 12, 24, 26), AngleOverlay("left.shoulder", 13, 11, 23), AngleOverlay("right.shoulder", 14, 12, 24))
private fun shortestSweep(start: Float, end: Float): Float { var sweep = (end - start) % 360f; if (sweep > 180f) sweep -= 360f; if (sweep < -180f) sweep += 360f; return sweep }
