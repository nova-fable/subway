import { CompositeLayer } from '@deck.gl/core/typed'

import { ScatterplotLayer, TextLayer } from '@deck.gl/layers/typed'
import type { Line, Station } from '~/types'

class StationsLayer extends CompositeLayer<{ id: string; data: Line; selected?: boolean; size?: 'sm' | 'lg'; labels?: boolean }> {
  renderLayers() {
    const line = this.props.data
    const size = this.props.size || 'sm'

    if (!line)
      return []
    return [
      new ScatterplotLayer<Station>({
        id: `${this.props.id || ''}stations`,
        data: line.stations,

        opacity: 0.8,
        stroked: true,
        filled: true,
        radiusScale: 12,
        pickable: true,
        radiusMinPixels: size === 'sm' ? 2 : 3,
        radiusMaxPixels: size === 'sm' ? 2 : 4,
        lineWidthMinPixels: 1,
        getFillColor: line.color,
        getPosition: data => data.coord,
      }),
      this.props.labels && new TextLayer<Station>({
        id: `${this.props.id || ''}labels`,
        data: line.stations,
        getSize: 10,
        getAngle: 0,
        getTextAnchor: 'middle',
        getAlignmentBaseline: 'center',
        characterSet: 'auto',
        getPosition: d => d.coord,
        getText: d => d.name,
        getPixelOffset: [10, -15],
        background: true,
        backgroundPadding: [1, 1],
        getBackgroundColor: [255, 255, 255],
        // getColor: [255, 255, 255],
      }),
    ]
  }
}
StationsLayer.layerName = 'StationsLayer'
StationsLayer.defaultProps = {
  pickable: true,
  autoHighlight: true,
}

export default StationsLayer
