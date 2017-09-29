
const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;

const AltTab = imports.ui.altTab;
const Main = imports.ui.main;
WindowManager = imports.ui.windowManager;

WindowManager.WindowManager.prototype._previewWorkspace = function(shellwm, from, to, direction) {
    if (!Main.sessionMode.hasWorkspaces || !this._shouldAnimate()) {
        shellwm.completed_switch_workspace();
        return;
    }

    let windows = global.get_window_actors();

    /* @direction is the direction that the "camera" moves, so the
     * screen contents have to move one screen's worth in the
     * opposite direction.
     */
    let xDest = 0, yDest = 0;

    if (direction == Meta.MotionDirection.UP ||
        direction == Meta.MotionDirection.UP_LEFT ||
        direction == Meta.MotionDirection.UP_RIGHT)
        yDest = global.screen_height - Main.panel.actor.height;
    else if (direction == Meta.MotionDirection.DOWN ||
             direction == Meta.MotionDirection.DOWN_LEFT ||
             direction == Meta.MotionDirection.DOWN_RIGHT)
        yDest = -global.screen_height + Main.panel.actor.height;

    if (direction == Meta.MotionDirection.LEFT ||
        direction == Meta.MotionDirection.UP_LEFT ||
        direction == Meta.MotionDirection.DOWN_LEFT)
        xDest = global.screen_width;
    else if (direction == Meta.MotionDirection.RIGHT ||
             direction == Meta.MotionDirection.UP_RIGHT ||
             direction == Meta.MotionDirection.DOWN_RIGHT)
        xDest = -global.screen_width;

    let switchData = {};
    this._switchData = switchData;
    switchData.inGroup = new Clutter.Actor();
    switchData.outGroup = new Clutter.Actor();
    switchData.movingWindowBin = new Clutter.Actor();
    switchData.windows = [];

    let wgroup = global.window_group;
    wgroup.add_actor(switchData.inGroup);
    wgroup.add_actor(switchData.outGroup);
    wgroup.add_actor(switchData.movingWindowBin);

    for (let i = 0; i < windows.length; i++) {
        let actor = windows[i];
        let window = actor.get_meta_window();

        if (!window.showing_on_its_workspace())
            continue;

        if (window.is_on_all_workspaces())
            continue;

        let record = { window: actor,
                       parent: actor.get_parent() };

        if (this._movingWindow && window == this._movingWindow) {
            switchData.movingWindow = record;
            switchData.windows.push(switchData.movingWindow);
            actor.reparent(switchData.movingWindowBin);
        } else if (window.get_workspace().index() == from) {
            switchData.windows.push(record);
            actor.reparent(switchData.outGroup);
        } else if (window.get_workspace().index() == to) {
            switchData.windows.push(record);
            actor.reparent(switchData.inGroup);
            actor.show();
        }
    }

    switchData.inGroup.set_position(-xDest, -yDest);
    switchData.inGroup.raise_top();

    switchData.movingWindowBin.raise_top();

    Tweener.addTween(switchData.outGroup,
                     { x: xDest,
                       y: yDest,
                       time: 0.25,
                       transition: 'easeOutQuad',
                       // onComplete: this._switchWorkspaceDone,
                       // onCompleteScope: this,
                       // onCompleteParams: [shellwm]
                     });
    Tweener.addTween(switchData.inGroup,
                     { x: 0,
                       y: 0,
                       time: 0.25,
                       transition: 'easeOutQuad'
                     });
}

let injections = {};

injections['_keyPressHandler'] = AltTab.WindowSwitcherPopup.prototype._keyPressHandler;

// Main.wm._forcedWindowSwitcher = function(display, screen, window, binding) {
//     /* prevent a corner case where both popups show up at once */
//     if (this._workspaceSwitcherPopup != null)
//         this._workspaceSwitcherPopup.destroy();

//     let tabPopup = new AltTab.WindowSwitcherPopup();

//     if (!tabPopup.show(binding.is_reversed(), binding.get_name(), binding.get_mask()))
//         tabPopup.destroy();
// };



LiveAltTab = Lang.Class({
    Name: 'LiveAltTab',
    Extends: altTab.WindowSwitcherPopup,

    _getwindowList: function () {
        return global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null);
    },

    _keyPressHandler: function(keysym, action) {
        switch(action) {
        case Meta.KeyBindingAction.SWITCH_APPLICATIONS:
            action = Meta.KeyBindingAction.SWITCH_WINDOWS;
            break;
        case Meta.KeyBindingAction.SWITCH_APPLICATIONS_BACKWARD:
            action = Meta.KeyBindingAction.SWITCH_WINDOWS_BACKWARD;
            break;
        }
        return injections['_keyPressHandler'].call(this, keysym, action);
    },

    _select: function(num) {

        if (this.switchedWorkspace) {
            Main.wm._switchWorkspaceDone(global.window_manager);
            this.switchedWorkspace = false;
        }

        let from = this._switcherList.windows[this._selectedIndex];
        let to = this._switcherList.windows[num];

        let fromIndex = from.get_workspace().workspace_index;
        let toIndex = to.get_workspace().workspace_index;
        if (toIndex !== fromIndex) {
            let direction = fromIndex > toIndex ? Meta.MotionDirection.DOWN : Meta.MotionDirection.UP;
            Main.wm._previewWorkspace(global.window_manager,
                                      from.get_workspace().workspace_index,
                                      to.get_workspace().workspace_index,
                                      direction)
            this.switchedWorkspace = true;
        }

        let space = spaceOf(to);
        ensure_viewport(space, to, true);
        this._selectedIndex = num;
        this._switcherList.highlight(num);
    },

    _finish: function() {
        this.parent();

        Main.wm._switchWorkspaceDone(global.window_manager);
    }
})


live_mru = (display, screen, meta_window, binding) => {
    let tabPopup = new LiveAltTab();
    tabPopup.show(binding.is_reversed(), binding.get_name(), binding.get_mask())
}


Meta.keybindings_set_custom_handler("switch-applications",
                                    dynamic_function_ref("live_mru"));
