/***** BEGIN LICENSE BLOCK ***** {{{
Version: MPL 1.1/GPL 2.0/LGPL 2.1

The contents of this file are subject to the Mozilla Public License Version
1.1 (the "License"); you may not use this file except in compliance with
the License. You may obtain a copy of the License at
http://www.mozilla.org/MPL/

Software distributed under the License is distributed on an "AS IS" basis,
WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
for the specific language governing rights and limitations under the
License.

(c) 2006-2008: Martin Stubenschrott <stubenschrott@gmx.net>

Alternatively, the contents of this file may be used under the terms of
either the GNU General Public License Version 2 or later (the "GPL"), or
the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
in which case the provisions of the GPL or the LGPL are applicable instead
of those above. If you wish to allow use of your version of this file only
under the terms of either the GPL or the LGPL, and not to allow others to
use your version of this file under the terms of the MPL, indicate your
decision by deleting the provisions above and replace them with the notice
and other provisions required by the GPL or the LGPL. If you do not delete
the provisions above, a recipient may use your version of this file under
the terms of any one of the MPL, the GPL or the LGPL.
}}} ***** END LICENSE BLOCK *****/

/** @scope modules */

// Do NOT create instances of this class yourself, use the helper method
// mappings.add() instead
function Map(modes, cmds, description, action, extraInfo) //{{{
{
    if (!modes || (!cmds || !cmds.length) || !action)
        return null;

    if (!extraInfo)
        extraInfo = {};

    this.modes = modes;
    // only store keysyms with uppercase modifier strings
    this.names = cmds.map(function (cmd) cmd.replace(/[casm]-/g, String.toUpperCase));
    this.action = action;

    this.flags = extraInfo.flags || 0;
    this.description = description || "";
    this.rhs = extraInfo.rhs || null;
    this.noremap = extraInfo.noremap || false;
    this.silent = extraInfo.silent || false;
};

Map.prototype = {

    hasName: function (name)
    {
        return this.names.indexOf(name) >= 0;
    },

    execute: function (motion, count, argument)
    {
        let args = [];

        if (this.flags & Mappings.flags.MOTION)
            args.push(motion);
        if (this.flags & Mappings.flags.COUNT)
            args.push(count);
        if (this.flags & Mappings.flags.ARGUMENT)
            args.push(argument);

        let self = this;
        // FIXME: Kludge.
        if (this.names[0] != ".")
            mappings.repeat = function () self.action.apply(self, args);

        return this.action.apply(this, args);
    }

}; //}}}

/**
 * @instance mappings
 */
function Mappings() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var main = []; // default mappings
    var user = []; // user created mappings

    for (let mode in modes)
    {
        main[mode] = [];
        user[mode] = [];
    }

    function addMap(map, userMap)
    {
        let where = userMap ? user : main;
        map.modes.forEach(function (mode) {
                if (!(mode in where))
                    where[mode] = [];
                where[mode].push(map);
        });
    }

    function getMap(mode, cmd, stack)
    {
        let maps = stack[mode] || [];

        for (let [,map] in Iterator(maps))
        {
            if (map.hasName(cmd))
                return map;
        }

        return null;
    }

    function removeMap(mode, cmd)
    {
        let maps = user[mode] || [];
        let names;

        for (let [i, map] in Iterator(maps))
        {
            for (let [j, name] in Iterator(map.names))
            {
                if (name == cmd)
                {
                    map.names.splice(j, 1);
                    if (map.names.length == 0)
                        maps.splice(i, 1);
                    return;
                }
            }
        }
    }

    function expandLeader(keyString) keyString.replace(/<Leader>/i, mappings.getMapLeader())

    // Return all mappings present in all @modes
    function mappingsIterator(modes, stack)
    {
        modes = modes.slice();
        return (map for ([i, map] in Iterator(stack[modes.shift()]))
            if (modes.every(function (mode) stack[mode].some(
                        function (m) m.rhs == map.rhs && m.names[0] == map.names[0]))))
    }

    function addMapCommands(ch, modes, modeDescription)
    {
        // 0 args -> list all maps
        // 1 arg  -> list the maps starting with args
        // 2 args -> map arg1 to arg*
        function map(args, mode, noremap)
        {
            if (!args.length)
            {
                mappings.list(mode);
                return;
            }

            // ?:\s+ <- don't remember; (...)? optional = rhs
            let [lhs, rhs] = args;

            if (!rhs) // list the mapping
            {
                mappings.list(mode, expandLeader(lhs));
            }
            else
            {
                for (let [,m] in Iterator(mode))
                {
                    mappings.addUserMap([m], [lhs],
                            "User defined mapping",
                            function (count) { events.feedkeys((count > 1 ? count : "") + this.rhs, this.noremap, this.silent); },
                            {
                                flags: Mappings.flags.COUNT,
                                rhs: rhs,
                                noremap: !!noremap,
                                silent: "<silent>" in args
                            });
                }
            }
        }

        modeDescription = modeDescription ? " in " + modeDescription + " mode" : "";

        const opts = {
                completer: function (context, args) completion.userMapping(context, args, modes),
                options: [
                    [["<silent>", "<Silent>"],  commands.OPTION_NOARG]
                ],
                literal: 1,
                serial: function ()
                {
                    let noremap = this.name.indexOf("noremap") > -1;
                    return [
                        {
                            command: this.name,
                            options: map.silent ? { "<silent>": null } : {},
                            arguments: [map.names[0]],
                            literalArg: map.rhs
                        }
                        for (map in mappingsIterator(modes, user))
                        if (map.rhs && map.noremap == noremap)
                    ]
                }
        };

        commands.add([ch ? ch + "m[ap]" : "map"],
            "Map a key sequence" + modeDescription,
            function (args) { map(args, modes, false); },
            opts);

        commands.add([ch + "no[remap]"],
            "Map a key sequence without remapping keys" + modeDescription,
            function (args) { map(args, modes, true); },
            opts);

        commands.add([ch + "mapc[lear]"],
            "Remove all mappings" + modeDescription,
            function () { modes.forEach(function (mode) { mappings.removeAll(mode); }); },
            { argCount: "0" });

        commands.add([ch + "unm[ap]"],
            "Remove a mapping" + modeDescription,
            function (args)
            {
                args = args[0];

                let found = false;
                for (let [,mode] in Iterator(modes))
                {
                    if (mappings.hasMap(mode, args))
                    {
                        mappings.remove(mode, args);
                        found = true;
                    }
                }
                if (!found)
                    liberator.echoerr("E31: No such mapping");
            },
            {
                argCount: "1",
                completer: function (context, args) completion.userMapping(context, args, modes)
            });
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    addMapCommands("",  [modes.NORMAL], "");
    addMapCommands("c", [modes.COMMAND_LINE], "command line");
    addMapCommands("i", [modes.INSERT, modes.TEXTAREA], "insert");
    if (liberator.has("mail"))
        addMapCommands("m", [modes.MESSAGE], "message");

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.registerObserver("load_completion", function ()
    {
        completion.setFunctionCompleter(mappings.get,
        [
            null,
            function (context, obj, args)
            {
                let mode = args[0]
                return util.Array.flatten(
                [
                    [[name, map.description] for ([i, name] in Iterator(map.names))]
                    for ([i, map] in Iterator(user[mode].concat(main[mode])))
                ])
            }
        ]);
    });

    // FIXME:
    Mappings.flags = {
        ALLOW_EVENT_ROUTING: 1 << 0, // if set, return true inside the map command to pass the event further to firefox
        MOTION:              1 << 1,
        COUNT:               1 << 2,
        ARGUMENT:            1 << 3
    };

    return {

        // NOTE: just normal mode for now
        __iterator__: function () mappingsIterator([modes.NORMAL], main),

        // used by :mkvimperatorrc to save mappings
        getUserIterator: function (mode) mappingsIterator(mode, user),

        add: function (modes, keys, description, action, extra)
        {
            addMap(new Map(modes, keys, description, action, extra), false);
        },

        addUserMap: function (modes, keys, description, action, extra)
        {
            keys = keys.map(expandLeader);
            let map = new Map(modes, keys, description || "User defined mapping", action, extra);

            // remove all old mappings to this key sequence
            for (let [,name] in Iterator(map.names))
            {
                for (let [,mode] in Iterator(map.modes))
                    removeMap(mode, name);
            }

            addMap(map, true);
        },

        get: function (mode, cmd)
        {
            mode = mode || modes.NORMAL;
            return getMap(mode, cmd, user) || getMap(mode, cmd, main);
        },

        getDefault: function (mode, cmd)
        {
            mode = mode || modes.NORMAL;
            return getMap(mode, cmd, main);
        },

        // returns an array of mappings with names which START with "cmd" (but are NOT "cmd")
        getCandidates: function (mode, cmd)
        {
            let mappings = user[mode].concat(main[mode]);
            let matches = [];

            for (let [,map] in Iterator(mappings))
            {
                for (let [,name] in Iterator(map.names))
                {
                    if (name.indexOf(cmd) == 0 && name.length > cmd.length)
                    {
                        // for < only return a candidate if it doesn't look like a <c-x> mapping
                        if (cmd != "<" || !/^<.+>/.test(name))
                            matches.push(map);
                    }
                }
            }

            return matches;
        },

        getMapLeader: function ()
        {
            let leaderRef = liberator.variableReference("mapleader");
            return leaderRef[0] ? leaderRef[0][leaderRef[1]] : "\\";
        },

        // returns whether the user added a custom user map
        hasMap: function (mode, cmd)
        {
            return user[mode].some(function (map) map.hasName(cmd));
        },

        remove: function (mode, cmd)
        {
            removeMap(mode, cmd);
        },

        removeAll: function (mode)
        {
            user[mode] = [];
        },

        list: function (modes, filter)
        {
            let modeSign = "";
            modes.forEach(function (mode)
            {
                if (mode == modes.NORMAL)
                    modeSign += "n";
                if ((mode == modes.INSERT || mode == modes.TEXTAREA) && modeSign.indexOf("i") == -1)
                    modeSign += "i";
                if (mode == modes.COMMAND_LINE)
                    modeSign += "c";
                if (mode == modes.MESSAGRE)
                    modeSign += "m";
            });

            let maps = mappingsIterator(modes, user);
            if (filter)
                maps = [map for (map in maps) if (map.names[0] == filter)];

            let list = <table>
                    {
                        template.map(maps, function (map)
                            template.map(map.names, function (name)
                            <tr>
                                <td>{modeSign} {name}</td>
                                <td>{map.noremap ? "*" : " "}</td>
                                <td>{map.rhs || "function () { ... }"}</td>
                            </tr>))
                    }
                    </table>;

            // TODO: Move this to an ItemList to show this automatically
            if (list.*.length() == list.text().length())
            {
                liberator.echomsg("No mapping found");
                return;
            }
            commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
        }

    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
