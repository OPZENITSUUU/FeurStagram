package com.feurstagram.extension;

import android.app.Activity;
import android.content.Context;
import android.content.ContextWrapper;
import android.content.Intent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;

import java.util.Collections;
import java.util.Map;
import java.util.WeakHashMap;

/**
 * Adds only the optional Files entry point to Instagram's existing DM composer.
 *
     * The target APK's real thread-composer container is the resource named
     * {@code row_thread_composer_bottom_container}. This class never changes any child already
 * owned by Instagram; it appends one independent Android button and launches
 * the platform document picker on click.
 */
public final class FilesAttachment {
    private static final String CONTAINER_ID = "row_thread_composer_bottom_container";
    private static final int OPEN_DOCUMENT_REQUEST = 0xF31;
    private static final Map<ViewGroup, Boolean> INSTALLED =
            Collections.synchronizedMap(new WeakHashMap<>());

    private FilesAttachment() {}

    /** Install a window watcher from the same stable tab-bar hook as Feurstagram. */
    public static void install(ViewGroup tabBar) {
        if (tabBar == null) return;
        tabBar.getViewTreeObserver().addOnGlobalLayoutListener(
                new ComposerWatcher(tabBar));
    }

    private static final class ComposerWatcher
            implements android.view.ViewTreeObserver.OnGlobalLayoutListener {
        private ViewGroup root;

        ComposerWatcher(ViewGroup root) {
            this.root = root;
        }

        @Override
        public void onGlobalLayout() {
            ViewGroup tabBar = root;
            if (tabBar == null) return;
            Context context = tabBar.getContext();
            if (context == null) return;
            int id = Hiders.resolveId(context, CONTAINER_ID);
            if (id == 0) return;
            View windowRoot = tabBar.getRootView();
            View target = windowRoot == null ? null : windowRoot.findViewById(id);
            if (!(target instanceof ViewGroup)) return;

            ViewGroup container = (ViewGroup) target;
            if (INSTALLED.containsKey(container)) return;
            INSTALLED.put(container, Boolean.TRUE);
            addFilesButton(container);
        }
    }

    private static void addFilesButton(ViewGroup container) {
        Context context = container.getContext();
        Button files = new Button(context);
        files.setText("Files");
        files.setAllCaps(false);
        files.setContentDescription("Files");
        files.setOnClickListener(v -> openDocument(v));
        container.addView(files, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT));
    }

    private static void openDocument(View source) {
        Context context = source.getContext();
        while (context instanceof ContextWrapper && !(context instanceof Activity)) {
            context = ((ContextWrapper) context).getBaseContext();
        }
        if (!(context instanceof Activity)) return;
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("*/*");
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false);
        ((Activity) context).startActivityForResult(intent, OPEN_DOCUMENT_REQUEST);
    }
}
