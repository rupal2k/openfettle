package com.example.exerciseform.sdk.smoothing

import com.example.exerciseform.sdk.api.*
import kotlin.math.*

interface LandmarkSmoother { fun reset(); fun smooth(frame: PoseFrame, minConfidence: Float): PoseFrame }
class EmaSmoother(private val alpha: Float): LandmarkSmoother {
    private var previous: MutableMap<Int, PoseLandmark> = mutableMapOf()
    override fun reset(){ previous.clear() }
    override fun smooth(frame: PoseFrame, minConfidence: Float): PoseFrame { val out=frame.landmarks.map { l -> val p=previous[l.index]; val a=(if(l.confidence>=minConfidence) alpha else .12f); val n=if(p==null||l.confidence<minConfidence) l else l.copy(x=p.x+(l.x-p.x)*a,y=p.y+(l.y-p.y)*a,z=p.z+(l.z-p.z)*a); previous[l.index]=n;n }; return frame.copy(landmarks=out) }
}
class SmaSmoother(private val window: Int): LandmarkSmoother {
    private val history=ArrayDeque<PoseFrame>(); override fun reset(){history.clear()}
    override fun smooth(frame: PoseFrame,minConfidence:Float):PoseFrame { history.addLast(frame); while(history.size>window.coerceAtLeast(1))history.removeFirst(); val out=frame.landmarks.map { l -> val q=history.mapNotNull{it.landmarks.find{p->p.index==l.index} }.filter{it.confidence>=minConfidence}; if(q.isEmpty())l else l.copy(x=q.map{it.x}.average().toFloat(),y=q.map{it.y}.average().toFloat(),z=q.map{it.z}.average().toFloat()) }; return frame.copy(landmarks=out) }
}
