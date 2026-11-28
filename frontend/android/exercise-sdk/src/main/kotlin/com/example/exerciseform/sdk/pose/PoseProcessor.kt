package com.example.exerciseform.sdk.pose

import com.example.exerciseform.sdk.api.*

/** Optional decoded-frame processor. The live camera path uses the ML Kit analyzer. */
interface PoseProcessor { suspend fun process(frame:FrameInput):PoseFrame?; fun close() }
class UnavailablePoseProcessor:PoseProcessor {
    override suspend fun process(frame:FrameInput):PoseFrame? = null
    override fun close() {}
}
