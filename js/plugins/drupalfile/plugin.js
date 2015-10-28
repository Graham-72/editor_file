/**
 * @file
 * Drupal File plugin.
 *
 * @ignore
 */

(function ($, Drupal, drupalSettings, CKEDITOR) {

  "use strict";

  CKEDITOR.plugins.add('drupalfile', {
    init: function (editor) {
      // Add the commands for file and unfile.
      editor.addCommand('drupalfile', {
        allowedContent: new CKEDITOR.style({
          element: 'a',
          attributes: {
            '!href': '',
            'target': '',
            'title': '',
            '!data-entity-type': '',
            '!data-entity-uuid': ''
          }
        }),
        requiredContent: new CKEDITOR.style({
          element: 'a',
          attributes: {
            'href': '',
            'data-entity-type': '',
            'data-entity-uuid': ''
          }
        }),
        modes: {wysiwyg: 1},
        canUndo: true,
        exec: function (editor) {
          var fileElement = getSelectedFile(editor);
          var fileDOMElement = null;

          // Set existing values based on selected element.
          var existingValues = {};
          if (fileElement && fileElement.$) {
            fileDOMElement = fileElement.$;

            // Populate an array with the file's current attributes.
            var attribute = null;
            var attributeName;
            for (var attrIndex = 0; attrIndex < fileDOMElement.attributes.length; attrIndex++) {
              attribute = fileDOMElement.attributes.item(attrIndex);
              attributeName = attribute.nodeName.toLowerCase();
              // Don't consider data-cke-saved- attributes; they're just there
              // to work around browser quirks.
              if (attributeName.substring(0, 15) === 'data-cke-saved-') {
                continue;
              }
              // Store the value for this attribute, unless there's a
              // data-cke-saved- alternative for it, which will contain the
              // quirk-free, original value.
              existingValues[attributeName] = fileElement.data('cke-saved-' + attributeName) || attribute.nodeValue;
            }
          }

          // Prepare a save callback to be used upon saving the dialog.
          var saveCallback = function (returnValues) {
            editor.fire('saveSnapshot');

            // Create a new file element if needed.
            if (!fileElement && returnValues.attributes.href) {
              var selection = editor.getSelection();
              var range = selection.getRanges(1)[0];

              // Use file URL as text with a collapsed cursor.
              if (range.collapsed) {
                // Shorten mailto URLs to just the email address.
                var text = new CKEDITOR.dom.text(returnValues.attributes.href.replace(/^mailto:/, ''), editor.document);
                range.insertNode(text);
                range.selectNodeContents(text);
              }

              // Ignore a disabled target attribute.
              if (returnValues.attributes.target === 0) {
                delete returnValues.attributes.target;
              }

              // Create the new file by applying a style to the new text.
              var style = new CKEDITOR.style({element: 'a', attributes: returnValues.attributes});
              style.type = CKEDITOR.STYLE_INLINE;
              style.applyToRange(range);
              range.select();

              // Set the file so individual properties may be set below.
              fileElement = getSelectedFile(editor);
            }
            // Update the file properties.
            else if (fileElement) {
              for (var attrName in returnValues.attributes) {
                if (returnValues.attributes.hasOwnProperty(attrName)) {
                  // Update the property if a value is specified.
                  if (returnValues.attributes[attrName].length > 0) {
                    var value = returnValues.attributes[attrName];
                    fileElement.data('cke-saved-' + attrName, value);
                    fileElement.setAttribute(attrName, value);
                  }
                  // Delete the property if set to an empty string.
                  else {
                    fileElement.removeAttribute(attrName);
                  }
                }
              }
            }

            // Save snapshot for undo support.
            editor.fire('saveSnapshot');
          };
          // Drupal.t() will not work inside CKEditor plugins because CKEditor
          // loads the JavaScript file instead of Drupal. Pull translated
          // strings from the plugin settings that are translated server-side.
          var dialogSettings = {
            title: fileElement ? editor.config.drupalFile_dialogTitleEdit : editor.config.drupalFile_dialogTitleAdd,
            dialogClass: 'editor-file-dialog'
          };

          // Open the dialog for the edit form.
          Drupal.ckeditor.openDialog(editor, Drupal.url('editor_file/dialog/file/' + editor.config.drupal.format), existingValues, saveCallback, dialogSettings);
        }
      });
      editor.addCommand('drupalunfile', {
        contextSensitive: 1,
        startDisabled: 1,
        allowedContent: 'a[!href]',
        requiredContent: 'a[href]',
        exec: function (editor) {
          var style = new CKEDITOR.style({element: 'a', type: CKEDITOR.STYLE_INLINE, alwaysRemoveElement: 1});
          editor.removeStyle(style);
        },
        refresh: function (editor, path) {
          var element = path.lastElement && path.lastElement.getAscendant('a', true);
          if (element && element.getName() === 'a' && element.getAttribute('href') && element.getChildCount()) {
            this.setState(CKEDITOR.TRISTATE_OFF);
          }
          else {
            this.setState(CKEDITOR.TRISTATE_DISABLED);
          }
        }
      });

      // CTRL + K.
      editor.setKeystroke(CKEDITOR.CTRL + 75, 'drupalfile');

      // Add buttons for file upload.
      if (editor.ui.addButton) {
        editor.ui.addButton('DrupalFile', {
          label: Drupal.t('File'),
          command: 'drupalfile',
          icon: this.path + '/file.png'
        });
      }

      editor.on('doubleclick', function (evt) {
        var element = getSelectedFile(editor) || evt.data.element;

        if (!element.isReadOnly()) {
          if (element.is('a')) {
            editor.getSelection().selectElement(element);
            editor.getCommand('drupalfile').exec();
          }
        }
      });

      // If the "menu" plugin is loaded, register the menu items.
      if (editor.addMenuItems) {
        editor.addMenuItems({
          file: {
            label: Drupal.t('Edit File'),
            command: 'drupalfile',
            group: 'file',
            order: 1
          }
        });
      }

      // If the "contextmenu" plugin is loaded, register the listeners.
      if (editor.contextMenu) {
        editor.contextMenu.addListener(function (element, selection) {
          if (!element || element.isReadOnly()) {
            return null;
          }
          var anchor = getSelectedFile(editor);
          if (!anchor) {
            return null;
          }

          var menu = {};
          if (anchor.getAttribute('href') && anchor.getChildCount()) {
            menu = {file: CKEDITOR.TRISTATE_OFF, unfile: CKEDITOR.TRISTATE_OFF};
          }
          return menu;
        });
      }
    },

    // Disable image2's integration with the link/drupallink plugins: don't
    // allow the widget itself to become a link. Support for that may be added
    // by an text filter that adds a data- attribute specifically for that.
    afterInit: function (editor) {
      if (editor.plugins.drupallink) {
        var cmd = editor.getCommand('drupallink');
        // Needs to be refreshed on selection changes.
        cmd.contextSensitive = 1;
        // Disable command and cancel event when the image widget is selected.
        cmd.on('refresh', function (evt) {
          var path = evt.data.path;
          var element = path.lastElement && path.lastElement.getAscendant('a', true);
          if (element && element.getName() === 'a' && element.getAttribute('data-entity-uuid')) {
            this.setState(CKEDITOR.TRISTATE_DISABLED);
          }
        });
      }
    }
  });

  /**
   * Get the surrounding file element of current selection.
   *
   * The following selection will all return the file element.
   *
   * @example
   *  <a href="#">li^nk</a>
   *  <a href="#">[file]</a>
   *  text[<a href="#">file]</a>
   *  <a href="#">li[nk</a>]
   *  [<b><a href="#">li]nk</a></b>]
   *  [<a href="#"><b>li]nk</b></a>
   *
   * @param {CKEDITOR.editor} editor
   *   The CKEditor editor object
   *
   * @return {?HTMLElement}
   *   The selected file element, or null.
   *
   */
  function getSelectedFile(editor) {
    var selection = editor.getSelection();
    var selectedElement = selection.getSelectedElement();
    if (selectedElement && selectedElement.is('a')) {
      return selectedElement;
    }

    var range = selection.getRanges(true)[0];

    if (range) {
      range.shrink(CKEDITOR.SHRINK_TEXT);
      return editor.elementPath(range.getCommonAncestor()).contains('a', 1);
    }
    return null;
  }

})(jQuery, Drupal, drupalSettings, CKEDITOR);
