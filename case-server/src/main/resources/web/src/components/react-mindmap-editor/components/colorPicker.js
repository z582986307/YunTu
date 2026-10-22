import React, { useState, useEffect } from 'react';
import { Button, Icon } from 'antd';
import { CompactPicker } from 'react-color';

const colors = [
  '#000000', '#ffffff', '#f3f8ff', '#edf5ff', '#e7f1ff', '#dbeafe', '#bfdbfe',
  '#93c5fd', '#60a5fa', '#3370ff', '#1d4ed8', '#d9f7be', '#fff1b8',
  '#ffd8bf', '#ffccc7', '#efdbff', '#d3adf7', '#d9d9d9', '#8c8c8c',
];

const popover = {
  position: 'absolute',
  zIndex: '2',
};
const cover = {
  position: 'fixed',
  top: '0px',
  right: '0px',
  bottom: '0px',
  left: '0px',
};

const ColorPicker = (props) => {
  const { minder, action, icon, button, onChange } = props;
  const [displayColorPicker, setDisplayColorPicker] = useState(false);
  const [color, setColor] = useState('');

  useEffect(() => {
    setColor(minder.queryCommandState(action) !== -1 ? minder.queryCommandValue(action) : '');
  }, [minder.getSelectedNode()]);

  const handleColorChange = (newColor) => {
    setColor(newColor.hex);
    onChange(newColor.hex);
    setDisplayColorPicker(false);
  };

  return (
    <div className="color-wrapper">
      <Button {...button} onClick={() => setDisplayColorPicker(!displayColorPicker)}>
        <Icon type={icon} style={{ color, backgroundColor: color === '#ffffff' ? '#ccc' : '' }} />
      </Button>
      {displayColorPicker && (
        <div style={popover}>
          <div style={cover} onClick={() => setDisplayColorPicker(false)} />
          <CompactPicker colors={colors} color={color} onChange={handleColorChange} />
        </div>
      )}
    </div>
  );
};
export default ColorPicker;
