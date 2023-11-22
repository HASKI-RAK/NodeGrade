import MenuIcon from '@mui/icons-material/Menu'
import ReplayIcon from '@mui/icons-material/Replay'
import SaveIcon from '@mui/icons-material/Save'
import { IconButton, styled, Toolbar, Typography } from '@mui/material'
import MuiAppBar, { AppBarProps as MuiAppBarProps } from '@mui/material/AppBar'

import { drawerWidth } from '@/pages/Editortest'

interface AppBarProps extends MuiAppBarProps {
  open?: boolean
  handleDrawerOpen?: () => void
  handleSaveGraph?: () => void
  handleClickChangeSocketUrl?: () => void
}

const AppBarStyled = styled(MuiAppBar, {
  shouldForwardProp: (prop) => prop !== 'open'
})<AppBarProps>(({ theme, open }) => ({
  transition: theme.transitions.create(['margin', 'width'], {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen
  }),
  ...(open && {
    width: `calc(100% - ${drawerWidth}px)`,
    transition: theme.transitions.create(['margin', 'width'], {
      easing: theme.transitions.easing.easeOut,
      duration: theme.transitions.duration.enteringScreen
    }),
    marginRight: drawerWidth
  })
}))

export const AppBar = (props: AppBarProps) => {
  return (
    <AppBarStyled position="fixed" open={props.open}>
      <Toolbar>
        <Typography variant="h6" noWrap sx={{ flexGrow: 1 }} component="div">
          Task Editor
        </Typography>
        <IconButton
          aria-label="change socket url"
          aria-controls="menu-appbar"
          aria-haspopup="true"
          color="inherit"
          onClick={props.handleClickChangeSocketUrl}
        >
          <ReplayIcon />
        </IconButton>
        <IconButton
          onClick={props.handleSaveGraph}
          aria-label="save"
          aria-controls="menu-appbar"
          aria-haspopup="true"
          color="inherit"
        >
          <SaveIcon />
        </IconButton>
        <IconButton
          color="inherit"
          aria-label="open drawer"
          edge="end"
          onClick={props.handleDrawerOpen}
          sx={{ ...(props.open && { display: 'none' }) }}
        >
          <MenuIcon />
        </IconButton>
      </Toolbar>
    </AppBarStyled>
  )
}

export default AppBar