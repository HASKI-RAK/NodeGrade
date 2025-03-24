import Box from '@mui/material/Box/Box'
import CircularProgress, { CircularProgressProps } from '@mui/material/CircularProgress'
import Typography from '@mui/material/Typography'

function CircularProgressWithLabel(props: CircularProgressProps & { value: number }) {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        backgroundColor: 'white',
        borderRadius: 2,
        padding: 2,
        boxShadow: 12
      }}
    >
      <Box sx={{ position: 'relative', display: 'inline-flex' }}>
        <CircularProgress variant="determinate" {...props} />
        <Box
          sx={{
            top: 0,
            left: 0,
            bottom: 0,
            right: 0,
            position: 'absolute',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Typography
            variant="caption"
            component="div"
            color="black"
          >{`${Math.round(props.value)}%`}</Typography>
        </Box>
      </Box>
      <Typography variant="body1" component="div" color="black">
        Hinweis: Die Auswertung kann bis zu zwei Minuten dauern. Bitte die Seite nicht neu
        laden. Bei hohem Aufkommen kann es zu längeren Wartezeiten kommen.
      </Typography>
    </Box>
  )
}

export default CircularProgressWithLabel
