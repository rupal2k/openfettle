package com.example.exerciseform.sdk.pose

import com.example.exerciseform.sdk.api.PoseFrame
import com.example.exerciseform.sdk.api.PoseLandmark
import com.google.mlkit.vision.pose.Pose

class MlKitPoseAdapter(private val mirrorHorizontally: Boolean) {
    fun toPoseFrame(pose: Pose, imageWidth: Int, imageHeight: Int, timestampNs: Long): PoseFrame {
        fun landmark(type: Int, index: Int): PoseLandmark? {
            val source = pose.getPoseLandmark(type) ?: return null
            val rawX = (source.position.x / imageWidth.toFloat()).coerceIn(0f, 1f)
            return PoseLandmark(index, if (mirrorHorizontally) 1f - rawX else rawX, (source.position.y / imageHeight.toFloat()).coerceIn(0f, 1f), 0f, source.inFrameLikelihood, source.inFrameLikelihood)
        }
        val landmarks = listOfNotNull(
            landmark(com.google.mlkit.vision.pose.PoseLandmark.NOSE, 0),
            landmark(com.google.mlkit.vision.pose.PoseLandmark.LEFT_SHOULDER, 11), landmark(com.google.mlkit.vision.pose.PoseLandmark.RIGHT_SHOULDER, 12),
            landmark(com.google.mlkit.vision.pose.PoseLandmark.LEFT_ELBOW, 13), landmark(com.google.mlkit.vision.pose.PoseLandmark.RIGHT_ELBOW, 14),
            landmark(com.google.mlkit.vision.pose.PoseLandmark.LEFT_WRIST, 15), landmark(com.google.mlkit.vision.pose.PoseLandmark.RIGHT_WRIST, 16),
            landmark(com.google.mlkit.vision.pose.PoseLandmark.LEFT_HIP, 23), landmark(com.google.mlkit.vision.pose.PoseLandmark.RIGHT_HIP, 24),
            landmark(com.google.mlkit.vision.pose.PoseLandmark.LEFT_KNEE, 25), landmark(com.google.mlkit.vision.pose.PoseLandmark.RIGHT_KNEE, 26),
            landmark(com.google.mlkit.vision.pose.PoseLandmark.LEFT_ANKLE, 27), landmark(com.google.mlkit.vision.pose.PoseLandmark.RIGHT_ANKLE, 28),
            landmark(com.google.mlkit.vision.pose.PoseLandmark.LEFT_HEEL, 29), landmark(com.google.mlkit.vision.pose.PoseLandmark.RIGHT_HEEL, 30),
            landmark(com.google.mlkit.vision.pose.PoseLandmark.LEFT_FOOT_INDEX, 31), landmark(com.google.mlkit.vision.pose.PoseLandmark.RIGHT_FOOT_INDEX, 32)
        )
        return PoseFrame(timestampNs, landmarks, imageWidth, imageHeight, mirrored = mirrorHorizontally)
    }
}
