package com.rupal2k.openfit;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;

/**
 * Keeps Wind down audible with the app minimised or the screen off. The sound itself is made by
 * Web Audio in the WebView; this media-playback foreground service (with its notification) stops
 * Android from freezing or dozing the app while it plays, and a partial wake lock keeps the CPU
 * feeding the audio. The notification's Stop button tells the WebView to fade out.
 */
public class WindDownService extends Service {
    static final String ACTION_STOP = "com.rupal2k.openfit.WIND_DOWN_STOP";
    static final String CHANNEL = "winddown";
    static final int ID = 7041;
    // the longest the wake lock may be held without a sleep timer (a forgotten "Off")
    private static final long MAX_HOLD_MS = 10L * 60 * 60 * 1000;

    private PowerManager.WakeLock wake;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable selfStop = this::stopNow;
    private static volatile WindDownService running;

    /**
     * Shows or updates the notification. Returns false when Android refuses to start the service,
     * which it does (Android 12+) while the app is not in front, for example behind the lock screen.
     * Updating the already running service needs no start, so it is allowed from the background.
     */
    static boolean start(Context c, String title, String text, String stopLabel, long untilMs) {
        Intent i = new Intent(c, WindDownService.class)
            .putExtra("title", title).putExtra("text", text).putExtra("stop", stopLabel).putExtra("until", untilMs);
        if (running != null) {   // plugin calls arrive off the main thread; the service works on it
            new Handler(Looper.getMainLooper()).post(() -> { WindDownService s = running; if (s != null) s.apply(i); });
            return true;
        }
        try {
            if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
            return true;
        } catch (IllegalStateException | SecurityException e) {   // ForegroundServiceStartNotAllowedException is an IllegalStateException
            return false;
        }
    }

    static void stop(Context c) {
        c.stopService(new Intent(c, WindDownService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            WindDownPlugin.notifyStopped();   // the WebView fades the sound out
            stopNow();
            return START_NOT_STICKY;
        }
        if (intent == null) { stopSelf(); return START_NOT_STICKY; }   // restarted without the WebView: nothing to play
        apply(intent);
        return START_NOT_STICKY;
    }

    private void apply(Intent intent) {
        running = this;
        Notification n = notification(intent.getStringExtra("title"), intent.getStringExtra("text"), intent.getStringExtra("stop"));
        if (Build.VERSION.SDK_INT >= 29) startForeground(ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
        else startForeground(ID, n);

        long until = intent.getLongExtra("until", 0);
        long hold = until > 0 ? Math.min(MAX_HOLD_MS, Math.max(0, until - System.currentTimeMillis()) + 60_000) : MAX_HOLD_MS;
        if (wake == null) {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "OpenFettle:winddown");
            wake.setReferenceCounted(false);
        }
        wake.acquire(hold);
        // backstop for the sleep timer: the audio fades by itself on the audio clock; this only
        // takes the notification and the wake lock away if the WebView's timer is throttled
        handler.removeCallbacks(selfStop);
        handler.postDelayed(selfStop, hold);
    }

    private Notification notification(String title, String text, String stopLabel) {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, title, NotificationManager.IMPORTANCE_LOW);
            ch.setSound(null, null);
            ch.setShowBadge(false);
            nm.createNotificationChannel(ch);
        }
        int pf = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        PendingIntent open = PendingIntent.getActivity(this, 0,
            new Intent(this, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), pf);
        PendingIntent stop = PendingIntent.getService(this, 1,
            new Intent(this, WindDownService.class).setAction(ACTION_STOP), pf);
        return new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_winddown)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(open)
            .addAction(0, stopLabel, stop)
            .setOngoing(true)
            .setSilent(true)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .build();
    }

    private void stopNow() {
        handler.removeCallbacks(selfStop);
        if (Build.VERSION.SDK_INT >= 24) stopForeground(STOP_FOREGROUND_REMOVE); else stopForeground(true);
        stopSelf();
    }

    @Override
    public void onDestroy() {
        if (running == this) running = null;
        handler.removeCallbacks(selfStop);
        if (wake != null && wake.isHeld()) wake.release();
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
