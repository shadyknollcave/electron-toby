import { useMemo } from 'react'
import {
  LineChart,
  BarChart,
  AreaChart,
  Line,
  Bar,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import type { ChartData } from '../../../../shared/types'

interface ChartRendererProps {
  chartData: ChartData
}

// Shared chart styling constants
const CHART_STYLES = {
  tooltip: {
    backgroundColor: 'var(--bg-tertiary)',
    border: '1px solid var(--glass-border)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-primary)'
  },
  legend: {
    color: 'var(--text-secondary)',
    fontSize: '0.875rem'
  },
  axis: {
    stroke: 'var(--text-secondary)',
    style: { fontSize: '0.875rem' }
  },
  grid: {
    strokeDasharray: '3 3',
    stroke: 'rgba(232, 235, 247, 0.1)'
  }
} as const

const DEFAULT_COLOR = '#00D9FF'

export function ChartRenderer({ chartData }: ChartRendererProps) {
  const { type, data, config, title } = chartData

  // Memoize chart component to prevent unnecessary re-renders
  const ChartComponent = useMemo(() => {
    // Prepare common props
    const commonProps = {
      data,
      margin: { top: 10, right: 30, left: 0, bottom: 0 }
    }

    // Render based on chart type
    switch (type) {
      case 'line':
        return (
          <LineChart {...commonProps}>
            <CartesianGrid {...CHART_STYLES.grid} />
            <XAxis dataKey={config.xKey} {...CHART_STYLES.axis} />
            <YAxis {...CHART_STYLES.axis} />
            <Tooltip contentStyle={CHART_STYLES.tooltip} />
            <Legend wrapperStyle={CHART_STYLES.legend} />
            {config.yKeys.map((yKey, index) => {
              const color = config.colors?.[index] || DEFAULT_COLOR
              return (
                <Line
                  key={yKey}
                  type="monotone"
                  dataKey={yKey}
                  stroke={color}
                  strokeWidth={2}
                  dot={{ fill: color, r: 4 }}
                  activeDot={{ r: 6 }}
                  name={config.labels?.[yKey] || yKey}
                />
              )
            })}
          </LineChart>
        )

      case 'bar':
        return (
          <BarChart {...commonProps}>
            <CartesianGrid {...CHART_STYLES.grid} />
            <XAxis dataKey={config.xKey} {...CHART_STYLES.axis} />
            <YAxis {...CHART_STYLES.axis} />
            <Tooltip contentStyle={CHART_STYLES.tooltip} />
            <Legend wrapperStyle={CHART_STYLES.legend} />
            {config.yKeys.map((yKey, index) => (
              <Bar
                key={yKey}
                dataKey={yKey}
                fill={config.colors?.[index] || DEFAULT_COLOR}
                name={config.labels?.[yKey] || yKey}
              />
            ))}
          </BarChart>
        )

      case 'area':
        return (
          <AreaChart {...commonProps}>
            <defs>
              {config.yKeys.map((yKey, index) => {
                const color = config.colors?.[index] || DEFAULT_COLOR
                return (
                  <linearGradient key={`gradient-${yKey}`} id={`color-${yKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.1} />
                  </linearGradient>
                )
              })}
            </defs>
            <CartesianGrid {...CHART_STYLES.grid} />
            <XAxis dataKey={config.xKey} {...CHART_STYLES.axis} />
            <YAxis {...CHART_STYLES.axis} />
            <Tooltip contentStyle={CHART_STYLES.tooltip} />
            <Legend wrapperStyle={CHART_STYLES.legend} />
            {config.yKeys.map((yKey, index) => (
              <Area
                key={yKey}
                type="monotone"
                dataKey={yKey}
                stroke={config.colors?.[index] || DEFAULT_COLOR}
                strokeWidth={2}
                fill={`url(#color-${yKey})`}
                name={config.labels?.[yKey] || yKey}
              />
            ))}
          </AreaChart>
        )

      default:
        return <div>Unsupported chart type: {type}</div>
    }
  }, [type, data, config, title])

  return (
    <div className="chart-container">
      {title && <h4 className="chart-title">{title}</h4>}
      <ResponsiveContainer width="100%" height={300}>
        {ChartComponent}
      </ResponsiveContainer>
    </div>
  )
}
